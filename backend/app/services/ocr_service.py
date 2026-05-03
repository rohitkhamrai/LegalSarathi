"""
OCR Service — EasyOCR + PyMuPDF for PDF rendering

Replaced PaddleOCR with EasyOCR which works reliably on Windows without
MKL-DNN/oneDNN runtime crashes or complex PaddleX version conflicts.

EasyOCR supports: en, hi, ta, te, kn, ml, mr, bn, gu, pa, ur
Model packs downloaded on first use (~100MB per language).
"""

import io
import os

# EasyOCR language code mapping
LANG_TO_EASYOCR = {
    "hi": ["hi", "en"],
    "ta": ["ta", "en"],
    "te": ["te", "en"],
    "kn": ["kn", "en"],
    "ml": ["ml", "en"],
    "mr": ["mr", "en"],
    "bn": ["bn", "en"],
    "gu": ["gu", "en"],
    "pa": ["pa", "en"],
    "ur": ["ur", "en"],
    "or": ["en"],       # Odia not supported by EasyOCR, fallback
    "en": ["en"],
}

# Per-language EasyOCR instance cache
_readers: dict = {}


def _get_reader(lang: str):
    """Lazy-load and cache an EasyOCR Reader for the given language."""
    try:
        import easyocr
    except ImportError:
        raise RuntimeError("easyocr not installed. Run: pip install easyocr")

    lang_list = LANG_TO_EASYOCR.get(lang, ["en"])
    cache_key = ",".join(lang_list)

    if cache_key not in _readers:
        print(f"[OCR] Loading EasyOCR for languages={lang_list} (first-time, may take a moment)")
        _readers[cache_key] = easyocr.Reader(lang_list, gpu=False, verbose=False)
        print(f"[OCR] EasyOCR ready for languages={lang_list}.")

    return _readers[cache_key]


def _run_ocr(reader, img_np) -> list:
    """Run EasyOCR on a numpy image and return a list of text strings."""
    try:
        results = reader.readtext(img_np, detail=0, paragraph=False)
        return [str(t).strip() for t in results if t and str(t).strip()]
    except Exception as e:
        print(f"[OCR] _run_ocr error: {e}")
        return []


def _pdf_to_images(pdf_bytes: bytes, dpi: int = 200):
    """Convert PDF pages to PIL Images (PyMuPDF preferred, pdf2image fallback)."""
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        images = []
        mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
        for page in doc:
            pix = page.get_pixmap(matrix=mat)
            from PIL import Image
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            images.append(img)
        doc.close()
        return images
    except ImportError:
        from pdf2image import convert_from_bytes
        return convert_from_bytes(pdf_bytes, dpi=dpi)


class OCRService:
    def extract_text(self, image_bytes: bytes, lang: str = "en") -> str:
        """OCR image bytes → clean text. Accepts JPEG, PNG, TIFF, BMP."""
        try:
            import numpy as np
            from PIL import Image

            img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            img_np = np.array(img)

            reader = _get_reader(lang)
            lines = _run_ocr(reader, img_np)
            text = "\n".join(lines).strip()

            print(f"[OCR] Extracted {len(text)} chars from image (lang={lang})")
            return text
        except Exception as e:
            print(f"[OCR] extract_text error: {e}")
            return ""

    def extract_from_pdf(self, pdf_bytes: bytes, lang: str = "en") -> str:
        """OCR a PDF: convert pages → images → OCR each → join."""
        try:
            import numpy as np

            images = _pdf_to_images(pdf_bytes)
            reader = _get_reader(lang)
            all_text = []

            for i, img in enumerate(images):
                img_np = np.array(img.convert("RGB"))
                lines = _run_ocr(reader, img_np)
                page_text = "\n".join(lines).strip()
                if page_text:
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
        return self.extract_text(file_bytes, lang)
