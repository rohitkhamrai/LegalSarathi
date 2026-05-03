import os
from dotenv import load_dotenv
import urllib.parse
import json
from pathlib import Path

_p1 = Path(__file__).resolve().parents[2] / ".env"
_p2 = Path(__file__).resolve().parents[1] / ".env"
_p3 = Path.cwd() / ".env"
if _p1.exists():
    load_dotenv(dotenv_path=str(_p1))
elif _p2.exists():
    load_dotenv(dotenv_path=str(_p2))
elif _p3.exists():
    load_dotenv(dotenv_path=str(_p3))
else:
    load_dotenv()

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from app.core.config import settings
from pydantic import BaseModel
from app.agents.orchestrator import Orchestrator
from app.services.pdf_service import PDFService
from app.services.voice_service import VoiceService
from app.services.doc_service import DocService
from app.services.ocr_service import OCRService
from app.services.document_generation_service import DocumentGenerationService
from jinja2 import TemplateNotFound

orchestrator = None
voice_service = None
doc_service = None
ocr_service = None
document_generation_service = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global orchestrator, voice_service, doc_service, ocr_service, document_generation_service
    try:
        orchestrator = Orchestrator()
    except Exception as e:
        print(f"[STARTUP ERROR] Orchestrator failed to initialize: {e}")

    try:
        voice_service = VoiceService()
    except Exception as e:
        print(f"[STARTUP ERROR] VoiceService failed to initialize: {e}")

    try:
        doc_service = DocService()
    except Exception as e:
        print(f"[STARTUP ERROR] DocService failed to initialize: {e}")

    try:
        ocr_service = OCRService()
    except Exception as e:
        print(f"[STARTUP ERROR] OCRService failed to initialize: {e}")

    try:
        document_generation_service = DocumentGenerationService()
        print("[STARTUP] DocumentGenerationService initialized successfully")
    except Exception as e:
        print(f"[STARTUP ERROR] DocumentGenerationService failed to initialize: {e}")
    yield

app = FastAPI(title="Legal Sarathi 2.0 API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:8080", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str
    language: str = "hi"
    pinned_history: list = []   # optional: messages from pinned session

class PDFRequest(BaseModel):
    guidance: str
    query: str = ""

class DocRequest(BaseModel):
    query: str
    doc_type: str = "RTI"
    lang: str = "en"

class TTSRequest(BaseModel):
    text: str
    lang: str = "hi"

class DocChatRequest(BaseModel):
    doc_id: str
    extracted_text: str
    message: str
    mode: str = "qa"           # summary|qa|clause_extract|translate|draft_reply
    history: list = []         # previous doc_chat_messages [{role, content}]
    language: str = "hi"

class DocumentGenerationRequest(BaseModel):
    """Request model for document generation endpoints."""
    doc_type: str  # e.g., "rti_application", "consumer_complaint"
    language: str = "english"  # Language variant of template
    data: dict  # Form data with template variables

class DocumentListResponse(BaseModel):
    """Response model for list of available documents."""
    available_documents: dict
    message: str = "Available document types and languages"



@app.get("/health")
@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "legal-sarathi-2.0"}


@app.post("/api/query")
async def process_legal_query(req: QueryRequest):
    if not orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator service is still initializing or failed to load.")
    return await orchestrator.process_query(
        text=req.query,
        lang=req.language,
        pinned_history=req.pinned_history if req.pinned_history else None,
    )


@app.post("/api/doc-chat")
async def doc_chat(req: DocChatRequest):
    """Document-specific chat. Bypasses RAG — extracted_text is the context."""
    if not orchestrator:
        raise HTTPException(status_code=503, detail="Orchestrator service unavailable")
    try:
        result = await orchestrator.process_doc_chat(
            doc_text=req.extracted_text,
            message=req.message,
            mode=req.mode,
            history=req.history,
            lang=req.language,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── OCR Endpoints ─────────────────────────────────────────────────────────────

@app.post("/api/ocr-extract")
async def ocr_extract(
    image: UploadFile = File(...),
    lang: str = Form(default="hi"),
):
    """
    OCR-only endpoint. Accepts image or PDF, returns extracted text.
    Frontend uses this to show a text preview before submitting to /api/ocr-query.
    """
    try:
        if not ocr_service:
            raise HTTPException(status_code=503, detail="OCR service is unavailable.")
        file_bytes = await image.read()
        filename = image.filename or ""
        extracted = ocr_service.extract(file_bytes, filename, lang)
        if not extracted:
            raise HTTPException(status_code=422, detail="Could not extract text from file.")
        return JSONResponse({"extracted_text": extracted, "char_count": len(extracted)})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ocr-query")
async def ocr_query(
    image: UploadFile = File(...),
    lang: str = Form(default="hi"),
):
    """
    Full pipeline: OCR image/PDF → extract text → run legal RAG pipeline.
    Returns the same structure as /api/query.
    """
    try:
        if not ocr_service or not orchestrator:
            raise HTTPException(status_code=503, detail="OCR or Orchestrator service is unavailable.")
        file_bytes = await image.read()
        filename = image.filename or ""
        extracted = ocr_service.extract(file_bytes, filename, lang)
        if not extracted:
            raise HTTPException(
                status_code=422,
                detail="Could not extract text from the uploaded file."
            )
        print(f"[OCR-QUERY] Extracted {len(extracted)} chars, routing to orchestrator (lang={lang})")
        result = await orchestrator.process_query(text=extracted, lang=lang)
        result["ocr_source"] = filename
        result["ocr_extracted_text"] = extracted[:500]   # preview for UI
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Voice Endpoints ───────────────────────────────────────────────────────────

@app.post("/api/tts")
async def text_to_speech(req: TTSRequest, background_tasks: BackgroundTasks):
    """Standalone TTS — convert any text to mp3 in given lang. Used for replay."""
    try:
        if not voice_service:
            raise HTTPException(status_code=503, detail="Voice service is unavailable.")
        mp3_path = await voice_service.synthesize(req.text, lang=req.lang)
        background_tasks.add_task(os.unlink, mp3_path)
        return FileResponse(
            mp3_path,
            media_type="audio/mpeg",
            filename="buddy_response.mp3"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/voice-query")
async def voice_query(
    background_tasks: BackgroundTasks,
    audio: UploadFile = File(...),
    lang: str = Form(default="hi")
):
    """Voice-in / Voice-out: accept audio (any format), return mp3 response."""
    try:
        if not voice_service or not orchestrator:
            raise HTTPException(status_code=503, detail="Voice or Orchestrator service is unavailable.")
        audio_bytes = await audio.read()
        # Groq Whisper accepts WebM/Opus/WAV directly — no conversion needed
        transcribed = voice_service.transcribe(audio_bytes, lang=lang)
        if not transcribed:
            raise HTTPException(status_code=422, detail="Could not understand audio.")

        result = await orchestrator.process_query(text=transcribed, lang=lang)
        buddy_text = result.get("buddy_text", "No guidance available.")

        mp3_path = await voice_service.synthesize(buddy_text, lang=lang)
        background_tasks.add_task(os.unlink, mp3_path)
        return FileResponse(
            mp3_path,
            media_type="audio/mpeg",
            filename="response.mp3",
            headers={
                "X-Transcription": urllib.parse.quote(transcribed[:200]),
                "X-Query-Result": json.dumps(result, ensure_ascii=True)
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ── Document Endpoints ────────────────────────────────────────────────────────

@app.post("/api/download-pdf")
async def download_pdf(req: PDFRequest):
    try:
        pdf_buffer = await PDFService.generate_draft(req.guidance, req.query)
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=legal_draft.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/generate-draft-pdf")
async def generate_draft_pdf(req: DocRequest):
    """Generates an RTI/FIR/BAIL draft using Groq and returns it as a PDF."""
    try:
        if not doc_service:
            raise HTTPException(status_code=503, detail="Doc service is unavailable.")
        draft_text = await doc_service.generate_document(req.query, req.doc_type, req.lang)
        pdf_buffer = await PDFService.generate_draft(draft_text, f"{req.doc_type} Draft: {req.query}")
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={req.doc_type.lower()}_draft.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Template Document Generation Endpoints ─────────────────────────────────────

@app.get("/api/documents/available")
async def get_available_documents():
    """Get list of all available document types and their language variants."""
    if not document_generation_service:
        raise HTTPException(status_code=503, detail="Service not initialized")
    try:
        available = document_generation_service.get_available_templates()
        return {"available_documents": available, "message": "Success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/documents/{doc_type}/fields")
async def get_document_fields(doc_type: str, language: str = "english"):
    """Get required form fields for a specific document type."""
    if not document_generation_service:
        raise HTTPException(status_code=503, detail="Service not initialized")
    try:
        if not document_generation_service.validate_document_type(doc_type):
            raise HTTPException(status_code=404, detail="Document type not found")
        fields = document_generation_service.get_required_fields(doc_type, language)
        info = document_generation_service.get_document_info(doc_type)
        return {"doc_type": doc_type, "language": language, "required_fields": fields, "document_info": info}
    except HTTPException: raise
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/documents/render")
async def render_document(req: DocumentGenerationRequest):
    """Render a legal document template with the provided data (HTML preview)."""
    if not document_generation_service:
        raise HTTPException(status_code=503, detail="Service not initialized")
    try:
        if not document_generation_service.validate_document_type(req.doc_type):
            raise HTTPException(status_code=400, detail="Invalid doc_type")
        html = document_generation_service.render_document(req.doc_type, req.language, req.data)
        return {"status": "success", "html": html}
    except TemplateNotFound: raise HTTPException(status_code=404, detail="Template not found")
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/documents/generate-pdf")
async def generate_template_pdf(req: DocumentGenerationRequest):
    """Render a document template and convert it to PDF."""
    if not document_generation_service:
        raise HTTPException(status_code=503, detail="Service not initialized")
    try:
        html = document_generation_service.render_document(req.doc_type, req.language, req.data)
        pdf_buffer = await PDFService.generate_draft(html, f"{req.doc_type} - {req.language}")
        filename = f"{req.doc_type}_{req.language}.pdf"
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
