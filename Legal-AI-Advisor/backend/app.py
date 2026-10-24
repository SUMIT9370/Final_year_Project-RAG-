import os
import shutil
import time
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
from werkzeug.exceptions import RequestEntityTooLarge
from pathlib import Path

from rag_pipeline import LegalRAGPipeline
from ingest import DocumentIngestionService
from config import Config
from utils.logger import setup_logger, log_request, log_response, log_error
from utils.helpers import (
    generate_unique_filename, sanitize_filename, create_error_response, 
    create_success_response, validate_json_structure
)

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for frontend

# Configure Flask
app.config['SECRET_KEY'] = Config.SECRET_KEY
app.config['UPLOAD_FOLDER'] = Config.UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = Config.MAX_CONTENT_LENGTH

# Create upload directory
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Setup logger
logger = setup_logger('legal_ai_api', Config.LOG_FILE, Config.LOG_LEVEL)

# Initialize services
try:
    rag_pipeline = LegalRAGPipeline()
    ingestion_service = DocumentIngestionService(rag_pipeline)
    logger.info("Services initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize services: {str(e)}")
    rag_pipeline = None
    ingestion_service = None

@app.route('/', methods=['GET'])
def api_root():
    """Return the API entry point and available checks."""
    return jsonify({
        "service": "Legal AI Advisor API",
        "status": "running",
        "health": "/health",
        "supported_formats": Config.SUPPORTED_FORMATS
    })

@app.before_request
def log_request_info():
    """Log incoming requests"""
    start_time = time.time()
    request.start_time = start_time
    log_request(logger, request.method, request.endpoint or request.path, request.remote_addr)

@app.after_request
def log_response_info(response):
    """Log outgoing responses"""
    if hasattr(request, 'start_time'):
        response_time = time.time() - request.start_time
        log_response(logger, request.method, request.endpoint or request.path, response.status_code, response_time)
    return response

@app.errorhandler(RequestEntityTooLarge)
def handle_file_too_large(e):
    """Handle file size exceeded error"""
    return jsonify(create_error_response(
        f"File size limit exceeded. Maximum upload size is {Config.MAX_CONTENT_LENGTH / (1024*1024):.0f}MB",
        413
    )), 413

@app.errorhandler(Exception)
def handle_exception(e):
    """Handle general exceptions"""
    log_error(logger, e, f"Unhandled exception in {request.endpoint or request.path}")
    return jsonify(create_error_response(
        str(e) or "Internal server error",
        500
    )), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        status = {
            "status": "healthy",
            "services": {
                "rag_pipeline": rag_pipeline is not None,
                "ingestion_service": ingestion_service is not None
            },
            "config": {
                "embedding_model": Config.EMBEDDING_MODEL,
                "llm_model": Config.LLM_MODEL,
                "supported_formats": Config.SUPPORTED_FORMATS,
                "max_file_size": f"{Config.MAX_CONTENT_LENGTH / (1024*1024):.0f}MB"
            }
        }
        
        if rag_pipeline:
            vector_info = rag_pipeline.get_vector_store_info()
            status["vector_store"] = vector_info
            status["telemetry"] = rag_pipeline.get_telemetry()
        
        return jsonify(create_success_response(status, "Health check successful"))
        
    except Exception as e:
        log_error(logger, e, "Health check failed")
        return jsonify(create_error_response(
            "Health check failed",
            500
        )), 500

@app.route('/api/stats', methods=['GET'])
def get_api_stats():
    """Real-time API call metrics, token savings, and cache monitor"""
    try:
        telemetry = rag_pipeline.get_telemetry() if rag_pipeline else {}
        return jsonify(create_success_response(telemetry, "API telemetry retrieved successfully"))
    except Exception as e:
        log_error(logger, e, "Failed to fetch API stats")
        return jsonify(create_error_response("Failed to fetch API stats", 500)), 500


@app.route('/upload', methods=['POST'])
def upload_document():
    """Upload and ingest single or multiple legal documents / images"""
    try:
        if not ingestion_service:
            return jsonify(create_error_response(
                "Ingestion service not available",
                503
            )), 503
        
        # Collect files from request (supports 'files', 'file', or multiple entries)
        files = request.files.getlist('files') or request.files.getlist('file')
        
        if not files or all(f.filename == '' for f in files):
            return jsonify(create_error_response(
                "No valid files provided for upload",
                400
            )), 400
        
        processed_files = []
        failed_files = []
        
        for file in files:
            if file.filename == '':
                continue
            
            original_filename = secure_filename(file.filename)
            sanitized_filename = sanitize_filename(original_filename)
            unique_filename = generate_unique_filename(sanitized_filename)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
            
            # Save file to upload directory
            file.save(file_path)
            
            # Validate file format and size
            validation = ingestion_service.validate_file(file_path)
            if not validation["valid"]:
                if os.path.exists(file_path):
                    os.remove(file_path)
                failed_files.append({
                    "filename": original_filename,
                    "error": validation["error"]
                })
                continue
            
            # Ingest file into RAG pipeline
            result = ingestion_service.ingest_file(file_path)
            
            if result["success"]:
                processed_files.append({
                    "filename": original_filename,
                    "file_size": result.get("file_size", 0),
                    "file_type": Path(original_filename).suffix.lower(),
                    "ingestion_time": time.time()
                })
            else:
                if os.path.exists(file_path):
                    os.remove(file_path)
                failed_files.append({
                    "filename": original_filename,
                    "error": result.get("error", "Failed to process document")
                })
        
        if not processed_files and failed_files:
            return jsonify(create_error_response(
                f"Failed to process uploaded files: {failed_files[0]['error']}",
                400
            )), 400
        
        response_data = {
            "processed_files": processed_files,
            "failed_files": failed_files,
            "total_processed": len(processed_files),
            "total_failed": len(failed_files),
            "timestamp": time.time()
        }
        
        msg = f"Successfully ingested {len(processed_files)} file(s)"
        if failed_files:
            msg += f" ({len(failed_files)} file(s) failed)"
            
        return jsonify(create_success_response(response_data, msg))
            
    except Exception as e:
        log_error(logger, e, "Document upload failed")
        return jsonify(create_error_response(
            f"Failed to upload document: {str(e)}",
            500
        )), 500

@app.route('/ask', methods=['POST'])
def ask_question():
    """Ask legal questions to the AI assistant"""
    try:
        if not rag_pipeline:
            return jsonify(create_error_response(
                "RAG pipeline service not available",
                503
            )), 503
        
        # Parse JSON request
        data = request.get_json(silent=True)
        if not data:
            return jsonify(create_error_response(
                "Invalid or missing JSON payload",
                400
            )), 400
        
        question = data.get('question', '').strip()
        if not question:
            return jsonify(create_error_response(
                "Question cannot be empty",
                400
            )), 400
        
        # Query the RAG system
        result = rag_pipeline.query(question)

        response_data = {
            "question": question,
            "answer": result.get("answer", "No response generated"),
            "sources": result.get("sources", []),
            "timestamp": time.time()
        }
        
        return jsonify(create_success_response(
            response_data,
            "Question processed successfully"
        ))
        
    except Exception as e:
        log_error(logger, e, "Question processing failed")
        return jsonify(create_error_response(
            f"Failed to process question: {str(e)}",
            500
        )), 500

@app.route('/documents', methods=['GET'])
def get_documents():
    """Get information about uploaded documents and vector store"""
    try:
        uploaded_files = []
        if os.path.exists(app.config['UPLOAD_FOLDER']):
            for f in os.listdir(app.config['UPLOAD_FOLDER']):
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], f)
                if os.path.isfile(file_path):
                    uploaded_files.append({
                        "name": f,
                        "size": os.path.getsize(file_path),
                        "modified": os.path.getmtime(file_path)
                    })
        
        vector_info = rag_pipeline.get_vector_store_info() if rag_pipeline else {}
        
        return jsonify(create_success_response({
            "uploaded_files": uploaded_files,
            "vector_store": vector_info,
            "supported_formats": Config.SUPPORTED_FORMATS
        }, "Documents listed successfully"))
    except Exception as e:
        log_error(logger, e, "Failed to fetch documents")
        return jsonify(create_error_response("Failed to fetch documents", 500)), 500

@app.route('/documents/reset', methods=['DELETE'])
def reset_documents():
    """Reset vector store and remove uploaded files"""
    try:
        if os.path.exists(app.config['UPLOAD_FOLDER']):
            for f in os.listdir(app.config['UPLOAD_FOLDER']):
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], f)
                if os.path.isfile(file_path):
                    os.remove(file_path)
                    
        if os.path.exists(Config.FAISS_INDEX_PATH):
            shutil.rmtree(Config.FAISS_INDEX_PATH)
            
        if rag_pipeline:
            rag_pipeline.vector_store = None
            rag_pipeline.qa_chain = None
            
        return jsonify(create_success_response({}, "Reset vector store and documents successfully"))
    except Exception as e:
        log_error(logger, e, "Failed to reset documents")
        return jsonify(create_error_response("Failed to reset documents", 500)), 500

@app.route('/sources', methods=['GET'])
def get_sources():
    """Get information about document sources"""
    try:
        info = rag_pipeline.get_vector_store_info() if rag_pipeline else {}
        supported_formats = Config.SUPPORTED_FORMATS
        
        response_data = {
            "vector_store": info,
            "supported_formats": supported_formats,
            "config": {
                "chunk_size": Config.CHUNK_SIZE,
                "chunk_overlap": Config.CHUNK_OVERLAP,
                "retrieval_k": Config.RETRIEVAL_K
            }
        }
        
        return jsonify(create_success_response(
            response_data,
            "Sources information retrieved successfully"
        ))
        
    except Exception as e:
        log_error(logger, e, "Failed to get sources")
        return jsonify(create_error_response("Failed to retrieve sources", 500)), 500

@app.route('/config', methods=['GET'])
def get_config():
    """Get public configuration information"""
    try:
        public_config = {
            "supported_formats": Config.SUPPORTED_FORMATS,
            "max_file_size": f"{Config.MAX_CONTENT_LENGTH / (1024*1024):.0f}MB",
            "models": {
                "embedding": Config.EMBEDDING_MODEL,
                "llm": Config.LLM_MODEL
            },
            "rag_config": {
                "chunk_size": Config.CHUNK_SIZE,
                "chunk_overlap": Config.CHUNK_OVERLAP,
                "retrieval_k": Config.RETRIEVAL_K
            }
        }
        
        return jsonify(create_success_response(
            public_config,
            "Configuration retrieved successfully"
        ))
        
    except Exception as e:
        log_error(logger, e, "Failed to get configuration")
        return jsonify(create_error_response("Failed to retrieve configuration", 500)), 500

if __name__ == '__main__':
    try:
        logger.info("Starting Legal AI Advisor API Server on port 5000")
        app.run(
            host='0.0.0.0',
            port=5000,
            debug=False
        )
    except Exception as e:
        log_error(logger, e, "Failed to start server")
        print(f"Failed to start server: {str(e)}")
