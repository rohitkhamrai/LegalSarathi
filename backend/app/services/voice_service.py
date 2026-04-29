"""
Voice Service — Groq Whisper STT + gTTS

STT: Uses Groq's Whisper API (whisper-large-v3-turbo) — free tier.
  - Accepts browser-native WebM/Opus audio directly (no format conversion needed)
  - Handles all Indian language speech via Whisper's multilingual model
  - No ffmpeg or pydub dependency required

TTS: Uses gTTS (Google TTS) — free, offline-friendly.
"""

import os
import io
import tempfile
from gtts import gTTS
import groq as groq_sdk
from app.core.config import settings

# Map of 2-letter lang codes to BCP-47 for Whisper language hint
LANG_TO_WHISPER = {
    "hi": "hi", "ta": "ta", "te": "te", "mr": "mr",
    "bn": "bn", "en": "en", "gu": "gu", "kn": "kn",
    "ml": "ml", "pa": "pa", "ur": "ur", "or": "or", "as": "as",
}


class VoiceService:
    def __init__(self):
        self._groq = groq_sdk.Groq(api_key=settings.GROQ_API_KEY)

    def transcribe(self, audio_bytes: bytes, lang: str = "hi") -> str:
        """
        STT: audio bytes (WebM/Opus/WAV/any) → text via Groq Whisper.
        lang: 2-letter code (e.g. 'hi', 'ta', 'en')
        """
        # Normalise lang: strip region suffix if present (e.g. 'hi-IN' → 'hi')
        lang_code = lang.split("-")[0].lower()
        whisper_lang = LANG_TO_WHISPER.get(lang_code, "hi")

        # Groq Whisper API requires a file-like with a filename (for MIME sniffing)
        # We wrap the bytes as a tuple: (filename, bytes_io, mimetype)
        audio_file = ("audio.webm", io.BytesIO(audio_bytes), "audio/webm")

        try:
            response = self._groq.audio.transcriptions.create(
                model="whisper-large-v3-turbo",
                file=audio_file,
                language=whisper_lang,
                response_format="text",
            )
            text = response.strip() if isinstance(response, str) else response.text.strip()
            print(f"[STT] Whisper transcribed ({lang_code}): '{text[:100]}'")
            return text
        except Exception as e:
            print(f"[STT] Groq Whisper error: {e}")
            return ""

    def synthesize(self, text: str, lang: str = "hi") -> str:
        """TTS: text → mp3 path. Uses gTTS. Returns absolute temp file path."""
        tts_lang = lang.split("-")[0].lower()
        supported = {'hi', 'ta', 'te', 'mr', 'bn', 'en', 'gu', 'kn', 'ml', 'pa', 'ur', 'or', 'as'}
        tts_lang = tts_lang if tts_lang in supported else 'hi'

        tts = gTTS(text=text, lang=tts_lang, slow=False)
        tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, prefix="sarathi_tts_")
        tmp.close()
        tts.save(tmp.name)
        return tmp.name
