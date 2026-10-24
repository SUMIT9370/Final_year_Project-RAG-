import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Configuration class for Legal AI Advisor"""
    
    # API Keys
    HUGGINGFACEHUB_API_TOKEN = os.getenv('HUGGINGFACEHUB_API_TOKEN')
    GROQ_API_KEY = os.getenv('GROQ_API_KEY')
    
    # Model Configuration
    EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
    LLM_MODEL = os.getenv('LLM_MODEL', 'qwen/qwen3.8-27b')  # Working Groq model
    MAX_TOKENS = 800  # Within free-tier OTPM rate limit
    
    # Supported File Formats
    SUPPORTED_DOC_FORMATS = ['.pdf', '.docx', '.txt']
    SUPPORTED_IMAGE_FORMATS = ['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.tiff']
    SUPPORTED_FORMATS = SUPPORTED_DOC_FORMATS + SUPPORTED_IMAGE_FORMATS
    
    # RAG Configuration
    CHUNK_SIZE = 1000
    CHUNK_OVERLAP = 200
    RETRIEVAL_K = 5
    
    # FAISS Configuration
    FAISS_INDEX_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "database", "faiss_index"))
    
    # Flask Configuration
    SECRET_KEY = os.getenv('SECRET_KEY', 'your-secret-key-here')
    UPLOAD_FOLDER = 'uploads'
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB max upload size
    
    # Logging Configuration
    LOG_LEVEL = 'INFO'
    LOG_FILE = 'legal_ai_advisor.log'
    
    @classmethod
    def validate_config(cls):
        """Validate required configuration"""
        required_vars = [
            'GROQ_API_KEY'
        ]
        
        missing_vars = []
        for var in required_vars:
            if not getattr(cls, var):
                missing_vars.append(var)
        
        if missing_vars:
            raise ValueError(f"Missing required environment variables: {missing_vars}")
        
        return True
