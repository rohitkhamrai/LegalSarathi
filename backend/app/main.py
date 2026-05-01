from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from app.core.config import settings
from pydantic import BaseModel
from app.agents.orchestrator import Orchestrator
from app.services.pdf_service import PDFService
from app.services.voice_service import VoiceService
from app.services.doc_service import DocService
from app.services.ocr_service import OCRService

app = FastAPI(title="Legal Sarathi 2.0 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str
    language: str = "hi"

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

orchestrator = Orchestrator()
voice_service = VoiceService()
doc_service   = DocService()
ocr_service   = OCRService()


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "legal-sarathi-2.0"}


@app.post("/api/query")
async def process_legal_query(req: QueryRequest):
    return await orchestrator.process_query(text=req.query, lang=req.language)


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
def text_to_speech(req: TTSRequest):
    """Standalone TTS — convert any text to mp3 in given lang. Used for replay."""
    try:
        mp3_path = voice_service.synthesize(req.text, lang=req.lang)
        return FileResponse(
            mp3_path,
            media_type="audio/mpeg",
            filename="buddy_response.mp3"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/voice-query")
async def voice_query(
    audio: UploadFile = File(...),
    lang: str = Form(default="hi")
):
    """Voice-in / Voice-out: accept audio (any format), return mp3 response."""
    try:
        audio_bytes = await audio.read()
        # Groq Whisper accepts WebM/Opus/WAV directly — no conversion needed
        transcribed = voice_service.transcribe(audio_bytes, lang=lang)
        if not transcribed:
            raise HTTPException(status_code=422, detail="Could not understand audio.")

        result = await orchestrator.process_query(text=transcribed, lang=lang)
        buddy_text = result.get("buddy_text", "No guidance available.")

        mp3_path = voice_service.synthesize(buddy_text, lang=lang)
        return FileResponse(
            mp3_path,
            media_type="audio/mpeg",
            filename="response.mp3",
            headers={
                "X-Transcription": __import__("urllib.parse").parse.quote(transcribed[:200]),
                "X-Query-Result": __import__("json").dumps(result, ensure_ascii=True)
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
        draft_text = await doc_service.generate_document(req.query, req.doc_type, req.lang)
        pdf_buffer = await PDFService.generate_draft(draft_text, f"{req.doc_type} Draft: {req.query}")
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={req.doc_type.lower()}_draft.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
