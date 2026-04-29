"""
OCR Service — EasyOCR (lazy-loaded) + PyMuPDF for PDF rendering
Reverted from PaddleOCR 3.x which has a known oneDNN crash on Windows CPU
(NotImplementedError: ConvertPirAttribute2RuntimeAttribute).

Strategy:
  - EasyOCR: stable, accurate for English + Indian scripts, CPU-safe
  - PyMuPDF (fitz): replaces Poppler/pdf2image, no binary install required,
    renders PDF pages to PIL images at high DPI for OCR

Supports: en, hi, ta, te, kn, ml, mr, bn, gu, pa, ur, or
Model packs downloaded on first use (~100-150MB per language combo).
"""

import io
import os
import numpy as np
from pathlib import Path


# EasyOCR language code mapping
LANG_TO_EASYOCR = {
    "hi": ["hi", "en"],   # Hindi (Devanagari)
    "ta": ["ta", "en"],   # Tamil
    "te": ["te", "en"],   # Telugu
    "kn": ["kn", "en"],   # Kannada
    "ml": ["ml", "en"],   # Malayalam
    "mr": ["hi", "en"],   # Marathi → Devanagari model
    "bn": ["bn", "en"],   # Bengali
    "gu": ["gu", "en"],   # Gujarati
    "pa": ["en"],          # Punjabi → Gurmukhi support limited, fallback English
    "ur": ["ur", "en"],   # Urdu
    "or": ["en"],          # Odia → fallback English
    "en": ["en"],
}

# Cache: key → EasyOCR Reader
_readers: dict = {}


def _get_reader(lang: str):
    """Lazy-load and cache EasyOCR reader for the given language."""
    try:
        import easyocr
    except ImportError:
        raise RuntimeError("easyocr not installed. Run: pip install easyocr")

    lang_list = LANG_TO_EASYOCR.get(lang, ["en"])
    key = ",".join(sorted(lang_list))

    if key not in _readers:
        print(f"[OCR] Loading EasyOCR for langs={lang_list} (first-time, may take 30s)")
        _readers[key] = easyocr.Reader(lang_list, gpu=False)
        print(f"[OCR] EasyOCR ready for key='{key}'.")

    return _readers[key]


def _pdf_to_images(pdf_bytes: bytes, dpi: int = 200):
    """
    Convert PDF pages to PIL Images using PyMuPDF (fitz).
    No Poppler required — pure Python.
    """
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        images = []
        scale = dpi / 72.0  # 72 is PDF's native DPI
        mat = fitz.Matrix(scale, scale)
        for page in doc:
            pix = page.get_pixmap(matrix=mat)
            from PIL import Image
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            images.append(img)
        doc.close()
        return images
    except ImportError:
        # Fallback to pdf2image + Poppler if PyMuPDF is unavailable
        from pdf2image import convert_from_bytes
        return convert_from_bytes(pdf_bytes, dpi=dpi)


class OCRService:
    def extract_text(self, image_bytes: bytes, lang: str = "en") -> str:
        """OCR image bytes → clean text. Accepts JPEG, PNG, TIFF, BMP."""
        try:
            reader = _get_reader(lang)
            results = reader.readtext(image_bytes, detail=0, paragraph=True)
            text = "\n".join(results).strip()
            print(f"[OCR] Extracted {len(text)} chars from image (lang={lang})")
            return text
        except Exception as e:
            print(f"[OCR] extract_text error: {e}")
            return ""

    def extract_from_pdf(self, pdf_bytes: bytes, lang: str = "en") -> str:
        """OCR a PDF: convert pages → images → OCR each → join."""
        try:
            images = _pdf_to_images(pdf_bytes)
            reader = _get_reader(lang)
            all_text = []

            for i, img in enumerate(images):
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                results = reader.readtext(buf.getvalue(), detail=0, paragraph=True)
                page_text = "\n".join(results).strip()
                all_text.append(f"[Page {i + 1}]\n{page_text}")
                print(f"[OCR] Page {i + 1}: {len(page_text)} chars")

            return "\n\n".join(all_text)

        except Exception as e:
            print(f"[OCR] extract_from_pdf error: {e}")
            return ""

    def extract(self, file_bytes: bytes, filename: str, lang: str = "en") -> str:
        """Auto-detect file type and route to the correct extractor."""
        ext = os.path.splitext(filename.lower())[1] if filename else ""
        if ext == ".pdf":
            return self.extract_from_pdf(file_bytes, lang)
        else:
            return self.extract_text(file_bytes, lang)
