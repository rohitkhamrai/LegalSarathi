"""
OCR Service — PaddleOCR (lazy-loaded) + PyMuPDF for PDF rendering

Strategy:
  - PaddleOCR: fast, accurate, scalable for English + Indian scripts
  - PyMuPDF (fitz): replaces Poppler/pdf2image, no binary install required,
    renders PDF pages to PIL images at high DPI for OCR

Supports: en, hi, ta, te, kn, ml, mr, bn, gu, pa, ur, or
Model packs downloaded on first use.
"""

import io
import os
from pathlib import Path


# PaddleOCR language code mapping
LANG_TO_PADDLEOCR = {
    "hi": "hi",
    "ta": "ta",
    "te": "te",
    "kn": "kn",
    "ml": "ml",
    "mr": "mr",
    "bn": "bn",
    "gu": "gu",
    "pa": "pa",
    "ur": "ur",
    "or": "en", # Odia fallback
    "en": "en",
}

# Cache: lang_key → PaddleOCR instance
_ocrs: dict = {}


def _get_paddle_ocr(lang: str):
    """Lazy-load and cache PaddleOCR instance for the given language."""
    try:
        from paddleocr import PaddleOCR
    except ImportError:
        raise RuntimeError("paddleocr not installed. Run: pip install paddleocr paddlepaddle")

    paddle_lang = LANG_TO_PADDLEOCR.get(lang, "en")

    if paddle_lang not in _ocrs:
        print(f"[OCR] Loading PaddleOCR for lang='{paddle_lang}' (first-time, may take a while)")
        _ocrs[paddle_lang] = PaddleOCR(use_angle_cls=True, lang=paddle_lang, use_gpu=False, show_log=False)
        print(f"[OCR] PaddleOCR ready for lang='{paddle_lang}'.")

    return _ocrs[paddle_lang]


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
            from PIL import Image
            import numpy as np

            img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            img_np = np.array(img)[:, :, ::-1]  # Convert RGB to BGR for PaddleOCR

            ocr = _get_paddle_ocr(lang)
            results = ocr.ocr(img_np, cls=True)

            if not results or not results[0]:
                return ""

            # results[0] is a list of [box, (text, confidence)]
            text_lines = [line[1][0] for line in results[0] if line and len(line) > 1 and len(line[1]) > 0]
            text = "\n".join(text_lines).strip()
            
            print(f"[OCR] Extracted {len(text)} chars from image (lang={lang})")
            return text
        except Exception as e:
            print(f"[OCR] extract_text error: {e}")
            return ""

    def extract_from_pdf(self, pdf_bytes: bytes, lang: str = "en") -> str:
        """OCR a PDF: convert pages → images → OCR each → join."""
        try:
            images = _pdf_to_images(pdf_bytes)
            ocr = _get_paddle_ocr(lang)
            all_text = []

            import numpy as np

            for i, img in enumerate(images):
                img_np = np.array(img.convert("RGB"))[:, :, ::-1]  # Convert RGB to BGR
                results = ocr.ocr(img_np, cls=True)

                if not results or not results[0]:
                    continue

                text_lines = [line[1][0] for line in results[0] if line and len(line) > 1 and len(line[1]) > 0]
                page_text = "\n".join(text_lines).strip()
                
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
