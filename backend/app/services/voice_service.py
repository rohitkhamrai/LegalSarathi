"""
Voice Service — Groq Whisper STT + gTTS

STT: Uses Groq's Whisper API (whisper-large-v3-turbo) — free tier.
  - Accepts browser-native WebM/Opus/OGG audio directly
  - temperature=0.0 → deterministic, no hallucination
  - initial_prompt → domain-primed for Indian legal vocabulary
  - Correct response parsing for Groq SDK v1.x (returns Transcription object)

TTS: Uses gTTS (Google TTS) — free, offline-friendly.
"""

import io
import tempfile
from gtts import gTTS
import groq as groq_sdk
from app.core.config import settings

# Map of 2-letter lang codes to ISO-639-1 for Whisper language hint
LANG_TO_WHISPER = {
    "hi": "hi", "ta": "ta", "te": "te", "mr": "mr",
    "bn": "bn", "en": "en", "gu": "gu", "kn": "kn",
    "ml": "ml", "pa": "pa", "ur": "ur", "or": "or", "as": "as",
}

# Domain-specific legal vocabulary prompt per language
# Whisper uses this to prime its vocabulary before transcription
LEGAL_PROMPTS = {
    "en": (
        "This is an Indian legal query. Common terms: FIR, IPC, BNSS, BNS, Section, "
        "Article, Bail, Warrant, Arrest, High Court, Supreme Court, RTI, NALSA, "
        "Advocate, Magistrate, Summons, Chargesheet, Cognizable, Non-cognizable."
    ),
    "hi": (
        "यह एक भारतीय कानूनी प्रश्न है। सामान्य शब्द: FIR, धारा, जमानत, वारंट, गिरफ्तारी, "
        "उच्च न्यायालय, सर्वोच्च न्यायालय, RTI, वकील, मजिस्ट्रेट, चालान, संज्ञेय।"
    ),
    "ta": (
        "இது ஒரு இந்திய சட்ட கேள்வி. பொதுவான சொற்கள்: FIR, பிரிவு, ஜாமீன், வாரண்ட், "
        "கைது, உயர் நீதிமன்றம், RTI, வழக்கறிஞர்."
    ),
    "te": (
        "ఇది ఒక భారతీయ న్యాయ ప్రశ్న. సాధారణ పదాలు: FIR, సెక్షన్, బెయిల్, వారెంట్, "
        "అరెస్టు, హైకోర్టు, RTI, న్యాయవాది."
    ),
    "kn": (
        "ಇದು ಒಂದು ಭಾರತೀಯ ಕಾನೂನು ಪ್ರಶ್ನೆ. ಸಾಮಾನ್ಯ ಪದಗಳು: FIR, ಸೆಕ್ಷನ್, ಜಾಮೀನು, "
        "ವಾರೆಂಟ್, ಬಂಧನ, ಹೈಕೋರ್ಟ್, RTI, ವಕೀಲ."
    ),
    "mr": (
        "हा एक भारतीय कायदेशीर प्रश्न आहे. सामान्य शब्द: FIR, कलम, जामीन, वॉरंट, "
        "अटक, उच्च न्यायालय, RTI, वकील."
    ),
}


class VoiceService:
    def __init__(self):
        self._groq = groq_sdk.Groq(api_key=settings.GROQ_API_KEY)

    def transcribe(self, audio_bytes: bytes, lang: str = "hi") -> str:
        """
        STT: audio bytes (WebM/Opus/OGG/WAV) → text via Groq Whisper.
        lang: 2-letter code (e.g. 'hi', 'ta', 'en')
        """
        lang_code = lang.split("-")[0].lower()
        whisper_lang = LANG_TO_WHISPER.get(lang_code, "hi")

        # Pick domain prompt — fallback to English prompt if no native one
        initial_prompt = LEGAL_PROMPTS.get(lang_code, LEGAL_PROMPTS["en"])

        # Groq Whisper requires a named file-like object for MIME detection
        # We always label it webm — Groq's Whisper handles the actual codec
        audio_file = ("audio.webm", io.BytesIO(audio_bytes), "audio/webm")

        try:
            response = self._groq.audio.transcriptions.create(
                model="whisper-large-v3-turbo",
                file=audio_file,
                language=whisper_lang,
                prompt=initial_prompt,        # domain priming
                temperature=0.0,              # deterministic — no hallucination
                response_format="verbose_json",  # gives us text + language detected
            )
            # Groq SDK v1.x returns a Transcription object — access .text
            text = (response.text or "").strip()
            detected = getattr(response, "language", whisper_lang)
            print(f"[STT] Whisper transcribed ({lang_code}, detected={detected}): '{text[:120]}'")
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
