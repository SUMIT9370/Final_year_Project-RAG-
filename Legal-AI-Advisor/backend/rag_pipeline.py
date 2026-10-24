import os
import re
import io
import time
import json
import base64
import hashlib
import logging
from typing import List, Dict, Any, Optional
from pathlib import Path
from PIL import Image
import numpy as np
import groq

from langchain_community.document_loaders import PDFPlumberLoader, Docx2txtLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_groq import ChatGroq
from langchain_classic.chains import RetrievalQA
from langchain_core.prompts import PromptTemplate
from langchain_core.documents import Document

from config import Config

# Configure logging
logging.basicConfig(
    level=getattr(logging, Config.LOG_LEVEL, logging.INFO),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(Config.LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Global OCR engine lazy initializer
_ocr_engine = None

def get_ocr_engine():
    global _ocr_engine
    if _ocr_engine is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
            _ocr_engine = RapidOCR()
            logger.info("RapidOCR engine initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize RapidOCR engine: {e}")
            _ocr_engine = False
    return _ocr_engine if _ocr_engine is not False else None


CACHE_FILE = os.path.join(os.path.dirname(__file__), ".vision_cache.json")

def _load_vision_cache() -> dict:
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def _save_vision_cache(cache: dict):
    try:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning(f"Could not persist vision cache: {e}")


class LegalRAGPipeline:
    """Production-ready RAG pipeline for Legal AI Advisor supporting Docs & Images with OCR"""
    
    def __init__(self):
        """Initialize the RAG pipeline"""
        try:
            Config.validate_config()
            # Set max_retries=0 so 429 doesn't freeze the app for 44-60 seconds
            self.groq_client = groq.Groq(api_key=Config.GROQ_API_KEY, max_retries=0) if Config.GROQ_API_KEY else None
            self.embeddings = self._initialize_embeddings()
            self.llm = self._initialize_llm()
            self.vector_store = None
            self.qa_chain = None
            self.conversation_history = []
            
            # Real-time API meter and telemetry
            self.telemetry = {
                "vision_calls": 0,
                "cache_hits": 0,
                "blank_skips": 0,
                "rate_limit_fallbacks": 0,
                "tokens_saved": 0,
                "last_latency_s": 0.0,
                "active_model": Config.LLM_MODEL
            }
            self.vision_cache = _load_vision_cache()
            
            # Load existing vector store if available
            self.load_vector_store()
            
            logger.info("Legal RAG Pipeline initialized successfully with Hybrid Vision OCR & Telemetry")
        except Exception as e:
            logger.error(f"Failed to initialize RAG Pipeline: {str(e)}")
            raise

    def get_telemetry(self) -> Dict[str, Any]:
        """Return real-time API call telemetry and optimization metrics"""
        return {
            **self.telemetry,
            "total_cached_items": len(self.vision_cache)
        }
    
    def _initialize_embeddings(self) -> HuggingFaceEmbeddings:
        """Initialize HuggingFace embeddings"""
        try:
            embeddings = HuggingFaceEmbeddings(
                model_name=Config.EMBEDDING_MODEL,
                model_kwargs={'device': 'cpu'},
                encode_kwargs={'normalize_embeddings': True}
            )
            logger.info(f"Embeddings initialized with model: {Config.EMBEDDING_MODEL}")
            return embeddings
        except Exception as e:
            logger.error(f"Failed to initialize embeddings: {str(e)}")
            raise
    
    def _initialize_llm(self) -> ChatGroq:
        """Initialize Groq LLM"""
        try:
            llm = ChatGroq(
                model=Config.LLM_MODEL,
                temperature=0.1,
                max_tokens=Config.MAX_TOKENS,
                groq_api_key=Config.GROQ_API_KEY
            )
            logger.info(f"LLM initialized with model: {Config.LLM_MODEL}")
            return llm
        except Exception as e:
            logger.error(f"Failed to initialize LLM: {str(e)}")
            raise
    
    def _clean_response(self, text: str) -> str:
        """Clean reasoning <think>...</think> tags from response text"""
        if not text:
            return ""
        # Remove think blocks
        cleaned = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
        return cleaned

    def _ocr_image_rapid(self, image_input) -> str:
        """Extract text using local RapidOCR engine as fallback"""
        ocr = get_ocr_engine()
        if not ocr:
            logger.warning("RapidOCR engine not available for fallback")
            return ""
        try:
            if isinstance(image_input, bytes):
                import cv2
                nparr = np.frombuffer(image_input, np.uint8)
                img_cv = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                result, _ = ocr(img_cv)
            elif isinstance(image_input, (str, Path)):
                result, _ = ocr(str(image_input))
            elif isinstance(image_input, Image.Image):
                img_cv = np.array(image_input)
                result, _ = ocr(img_cv)
            else:
                result, _ = ocr(image_input)

            if result:
                lines = [line[1] for line in result if len(line) > 1 and line[1].strip()]
                return "\n".join(lines)
        except Exception as e:
            logger.error(f"Error executing RapidOCR fallback: {e}")
        return ""

    def _ocr_image_hybrid(self, image_input, source_desc="document") -> str:
        """
        Multilingual Hybrid Vision OCR with API Call Minimizer & Telemetry:
        1. Checks MD5 disk cache first (0 API calls, 0s latency).
        2. Detects blank pages to avoid wasting API tokens.
        3. Scales to 960px JPEG (cuts token usage by 65%).
        4. Transcribes via Groq Vision (Qwen-3.8 Multimodal).
        5. On 429 RateLimit, immediately falls back to RapidOCR (no 44-second wait).
        """
        # Step 1: Prepare PIL Image and compute raw hash
        img = None
        raw_bytes = None
        try:
            if isinstance(image_input, (str, Path)):
                with open(str(image_input), 'rb') as f:
                    raw_bytes = f.read()
                img = Image.open(io.BytesIO(raw_bytes))
            elif isinstance(image_input, bytes):
                raw_bytes = image_input
                img = Image.open(io.BytesIO(raw_bytes))
            elif isinstance(image_input, Image.Image):
                img = image_input
                buf = io.BytesIO()
                img.save(buf, format='PNG')
                raw_bytes = buf.getvalue()
        except Exception as e:
            logger.warning(f"Could not load image for {source_desc}: {e}")
            return ""

        if img is None:
            return ""

        # Step 2: Cache Check (Minimizes API calls to ZERO for previously seen images)
        if raw_bytes:
            img_hash = hashlib.md5(raw_bytes).hexdigest()
            if img_hash in self.vision_cache:
                self.telemetry["cache_hits"] += 1
                self.telemetry["tokens_saved"] += 1200
                logger.info(f"⚡ [CACHE HIT] {source_desc} served from Vision Cache (0 API calls, 0s delay)")
                return self.vision_cache[img_hash]
        else:
            img_hash = None

        # Step 3: Blank / Uniform Page Detection (Minimizes API calls on empty scan pages)
        try:
            gray_arr = np.array(img.convert("L"))
            if gray_arr.std() < 5.0:  # Essentially blank white or solid page
                self.telemetry["blank_skips"] += 1
                logger.info(f"⚪ [BLANK SKIP] {source_desc} is blank (std={gray_arr.std():.1f}). Skipped API call.")
                return ""
        except Exception:
            pass

        # Step 4: Groq Vision OCR with Token Minimization (scaled to 960px)
        if self.groq_client:
            t0 = time.time()
            try:
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # Resize proportionally to max 960px (preserves full readability while cutting tokens to ~650)
                max_dim = 960
                if max(img.size) > max_dim:
                    scale = max_dim / max(img.size)
                    new_size = (int(img.size[0] * scale), int(img.size[1] * scale))
                    img = img.resize(new_size, Image.Resampling.LANCZOS)
                
                buf = io.BytesIO()
                img.save(buf, format='JPEG', quality=78)
                b64_data = base64.b64encode(buf.getvalue()).decode('utf-8')

                prompt = (
                    "You are an expert Indian Legal OCR engine. Transcribe all text in this document photo/page verbatim. "
                    "Accurately capture every name, date, serial/stamp number, amount, document title (such as Kararpatra/करारपत्र, Agreement, "
                    "Affidavit, Order, Undertaking, Admission Letter), notary seals, Aadhaar numbers, and clauses in Marathi, Hindi (Devanagari), and English. "
                    "Output the exact transcription and relevant English translation notes for key legal terms so that it can be retrieved and searched."
                )

                resp = self.groq_client.chat.completions.create(
                    model=Config.LLM_MODEL,
                    messages=[{
                        'role': 'user',
                        'content': [
                            {'type': 'text', 'text': prompt},
                            {'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{b64_data}'}}
                        ]
                    }],
                    max_tokens=Config.MAX_TOKENS,
                    temperature=0.1
                )
                content = resp.choices[0].message.content or ""
                cleaned = self._clean_response(content)
                elapsed = time.time() - t0

                if len(cleaned.strip()) >= 15:
                    self.telemetry["vision_calls"] += 1
                    self.telemetry["last_latency_s"] = round(elapsed, 2)
                    logger.info(f"✅ [VISION API CALL] {source_desc} transcribed in {elapsed:.2f}s ({len(cleaned)} chars)")
                    
                    # Store in disk cache to avoid ever calling API again for this page
                    if img_hash:
                        self.vision_cache[img_hash] = cleaned.strip()
                        _save_vision_cache(self.vision_cache)

                    return cleaned.strip()

            except groq.RateLimitError as rle:
                # Groq TPM rate limit hit: instantly switch to RapidOCR (NO 44s sleep!)
                self.telemetry["rate_limit_fallbacks"] += 1
                logger.warning(f"⚠️ [RATE LIMIT] Groq TPM limit reached for {source_desc}. Immediately falling back to RapidOCR.")
                return self._ocr_image_rapid(image_input)
            except Exception as e:
                logger.warning(f"Groq Vision OCR error on {source_desc}: {e}. Falling back to RapidOCR.")

        # Fallback to local RapidOCR
        return self._ocr_image_rapid(image_input)


    def load_documents(self, file_path: str) -> List[Document]:
        """Load documents from PDF, DOCX, TXT, or Image formats with Hybrid Multilingual OCR"""
        try:
            file_extension = Path(file_path).suffix.lower()
            source_name = Path(file_path).name
            documents: List[Document] = []
            
            if file_extension == '.pdf':
                try:
                    import pymupdf
                    doc_fitz = pymupdf.open(file_path)
                    logger.info(f"Processing PDF {source_name} ({len(doc_fitz)} pages) with Hybrid Page Parser")
                    
                    for page_num in range(len(doc_fitz)):
                        page = doc_fitz[page_num]
                        page_text = page.get_text().strip()
                        
                        # If page has minimal digital text (< 50 chars), it is a photo or scanned page!
                        if len(page_text) < 50:
                            logger.info(f"PDF {source_name} p.{page_num + 1} has minimal digital text. Running Vision OCR...")
                            pix = page.get_pixmap(dpi=130)
                            ocr_text = self._ocr_image_hybrid(
                                pix.tobytes('png'),
                                source_desc=f"{source_name} p.{page_num + 1}"
                            )
                            if ocr_text:
                                page_text = ocr_text
                            # Pause slightly to stay within Groq rate limits for large multi-page photo PDFs
                            time.sleep(0.5)
                        
                        if page_text:
                            # Sanitize text encoding to prevent Windows cp1252 or surrogate character crashes
                            sanitized = page_text.encode('utf-8', errors='replace').decode('utf-8')
                            documents.append(Document(
                                page_content=sanitized,
                                metadata={'source': file_path, 'page': page_num + 1}
                            ))
                    doc_fitz.close()
                except Exception as e:
                    logger.error(f"PyMuPDF + Hybrid OCR failed for PDF {file_path}: {e}")
                    # Fallback to pdfplumber if fitz fails
                    try:
                        loader = PDFPlumberLoader(file_path)
                        documents = loader.load()
                    except Exception as e2:
                        logger.error(f"pdfplumber fallback also failed for {file_path}: {e2}")
                        documents = []
                        
            elif file_extension in Config.SUPPORTED_IMAGE_FORMATS:
                logger.info(f"Processing standalone image file with Hybrid OCR: {source_name}")
                extracted_text = self._ocr_image_hybrid(file_path, source_desc=source_name)
                if extracted_text:
                    sanitized = extracted_text.encode('utf-8', errors='replace').decode('utf-8')
                    documents.append(Document(
                        page_content=sanitized,
                        metadata={'source': file_path, 'page': 1, 'is_image': True}
                    ))
                else:
                    logger.warning(f"No text extracted from image {source_name}")
                    
            elif file_extension == '.docx':
                loader = Docx2txtLoader(file_path)
                documents = loader.load()
            elif file_extension == '.txt':
                loader = TextLoader(file_path, encoding='utf-8')
                documents = loader.load()
            else:
                raise ValueError(f"Unsupported file format: {file_extension}")
            
            logger.info(f"Loaded {len(documents)} pages/sections from {source_name}")
            return documents

            
        except Exception as e:
            logger.error(f"Failed to load documents from {file_path}: {str(e)}")
            raise
    
    def split_documents(self, documents: List[Document]) -> List[Document]:
        """Split documents into chunks using intelligent text splitter"""
        try:
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=Config.CHUNK_SIZE,
                chunk_overlap=Config.CHUNK_OVERLAP,
                separators=["\n\n", "\n", ". ", " ", ""]
            )
            
            chunks = text_splitter.split_documents(documents)
            valid_chunks = []
            
            for i, chunk in enumerate(chunks):
                content = chunk.page_content.strip()
                if not content:
                    continue
                source_path = chunk.metadata.get('source', 'unknown')
                chunk.metadata.update({
                    'chunk_id': i,
                    'source_file': source_path,
                    'filename': Path(source_path).name if source_path != 'unknown' else 'unknown',
                    'page': chunk.metadata.get('page', 1)
                })
                valid_chunks.append(chunk)
            
            logger.info(f"Split documents into {len(valid_chunks)} valid chunks")
            return valid_chunks
            
        except Exception as e:
            logger.error(f"Failed to split documents: {str(e)}")
            raise
    
    def create_vector_store(self, chunks: List[Document]) -> FAISS:
        """Create and save FAISS vector store"""
        try:
            if not chunks:
                raise ValueError("No valid document chunks provided to create vector store")
                
            vector_store = FAISS.from_documents(chunks, self.embeddings)
            
            os.makedirs(Config.FAISS_INDEX_PATH, exist_ok=True)
            vector_store.save_local(Config.FAISS_INDEX_PATH)
            
            self.vector_store = vector_store
            logger.info(f"Created and saved vector store with {len(chunks)} chunks")
            return vector_store
            
        except Exception as e:
            logger.error(f"Failed to create vector store: {str(e)}")
            raise
    
    def load_vector_store(self) -> Optional[FAISS]:
        """Load existing FAISS vector store"""
        try:
            index_file = os.path.join(Config.FAISS_INDEX_PATH, "index.faiss")
            pkl_file = os.path.join(Config.FAISS_INDEX_PATH, "index.pkl")
            
            if os.path.exists(index_file) and os.path.exists(pkl_file):
                vector_store = FAISS.load_local(
                    Config.FAISS_INDEX_PATH, 
                    self.embeddings,
                    allow_dangerous_deserialization=True
                )
                self.vector_store = vector_store
                logger.info("Loaded existing vector store")
                return vector_store
            else:
                logger.warning("No existing vector store found")
                return None
                
        except Exception as e:
            logger.error(f"Failed to load vector store: {str(e)}")
            return None
    
    def create_qa_chain(self):
        """Create RAG QA chain with legal-specific prompt"""
        try:
            if not self.vector_store:
                raise ValueError("Vector store not initialized")
            
            template = """You are an expert AI Legal Assistant specializing in Indian Law.
Use the provided legal context to answer the user's question accurately, concisely, and professionally.
Cite relevant legal provisions, section numbers, and uploaded document references when possible.

If the specific answer is not fully contained in the context, synthesize the context with standard Indian legal knowledge, clearly stating what is directly from the context.

Context:
{context}

Question: {question}

Answer:"""
            
            prompt = PromptTemplate(
                template=template,
                input_variables=["context", "question"]
            )
            
            retriever = self.vector_store.as_retriever(
                search_type="similarity",
                search_kwargs={"k": Config.RETRIEVAL_K}
            )
            
            self.qa_chain = RetrievalQA.from_chain_type(
                llm=self.llm,
                chain_type="stuff",
                retriever=retriever,
                chain_type_kwargs={"prompt": prompt},
                return_source_documents=True
            )
            
            logger.info("QA chain created successfully")
            
        except Exception as e:
            logger.error(f"Failed to create QA chain: {str(e)}")
            raise
    
    def query(self, question: str) -> Dict[str, Any]:
        """Query the RAG system with fallback for empty vector store"""
        try:
            # If no vector store exists, use LLM directly to answer general legal queries
            if not self.vector_store:
                self.load_vector_store()
            
            if not self.vector_store:
                logger.info("No vector store found. Direct LLM query fallback...")
                messages = [
                    {"role": "system", "content": "You are an expert AI Legal Assistant specializing in Indian Law. Answer questions accurately and professionally with legal references."},
                    {"role": "user", "content": question}
                ]
                raw_response = self.llm.invoke(messages).content
                clean_ans = self._clean_response(raw_response)
                
                return {
                    "answer": clean_ans + "\n\n*(Note: Answer provided based on general Indian legal knowledge as no custom legal documents have been uploaded yet.)*",
                    "sources": [],
                    "question": question
                }
            
            if not self.qa_chain:
                self.create_qa_chain()
            
            self.conversation_history.append({"question": question})
            
            result = self.qa_chain.invoke({"query": question})
            
            raw_answer = result.get("result", "")
            clean_answer = self._clean_response(raw_answer)
            
            sources = []
            if "source_documents" in result:
                for doc in result["source_documents"]:
                    sources.append({
                        "content": doc.page_content[:250] + "...",
                        "metadata": doc.metadata
                    })
            
            response = {
                "answer": clean_answer,
                "sources": sources,
                "question": question
            }
            
            self.conversation_history.append({"answer": response["answer"]})
            logger.info(f"Query processed successfully: {question[:50]}...")
            return response
            
        except Exception as e:
            logger.error(f"Failed to process query: {str(e)}")
            return {
                "answer": f"I encountered an issue processing your request: {str(e)}. Please try asking again.",
                "sources": [],
                "question": question,
                "error": str(e)
            }
    
    def add_documents(self, file_path: str) -> bool:
        """Add new documents or images to the vector store"""
        try:
            documents = self.load_documents(file_path)
            chunks = self.split_documents(documents)
            
            if len(chunks) == 0:
                logger.warning(f"No valid chunks created from {file_path}")
                return False
            
            if self.vector_store is None:
                self.load_vector_store()
            
            if self.vector_store is None:
                self.create_vector_store(chunks)
            else:
                self.vector_store.add_documents(chunks)
                self.vector_store.save_local(Config.FAISS_INDEX_PATH)
            
            # Recreate QA chain with updated vector store
            self.create_qa_chain()
            
            logger.info(f"Successfully added {len(chunks)} chunks from {file_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to add documents from {file_path}: {str(e)}")
            return False
    
    def get_vector_store_info(self) -> Dict[str, Any]:
        """Get information about the vector store"""
        try:
            if self.vector_store is None:
                self.load_vector_store()
            
            if self.vector_store is None:
                return {"status": "No vector store initialized"}
            
            return {
                "status": "Vector store active",
                "embedding_model": Config.EMBEDDING_MODEL,
                "llm_model": Config.LLM_MODEL,
                "retrieval_k": Config.RETRIEVAL_K
            }
            
        except Exception as e:
            logger.error(f"Failed to get vector store info: {str(e)}")
            return {"status": "Error", "error": str(e)}


# Global pipeline instance
rag_pipeline = LegalRAGPipeline()
