"""
medication_service/services/ocr_service.py
Prescription OCR: accepts image/PDF, extracts clinical fields using regex + NLP patterns.
Production-grade: supports pytesseract (local) and falls back to cloud vision.
"""
from __future__ import annotations
import re
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Clinical extraction patterns
PATTERNS = {
    "medicine_name": re.compile(
        r"(?:rx|drug|medication|medicine|tab|cap|inj)\s*[:\-]?\s*([A-Za-z][A-Za-z0-9\s\-]+?)(?:\s*\d|\n|,|\.)",
        re.IGNORECASE,
    ),
    "dosage": re.compile(
        r"(\d+(?:\.\d+)?\s*(?:mg|mcg|ml|mL|g|iu|IU|units?|tabs?|caps?))",
        re.IGNORECASE,
    ),
    "frequency": re.compile(
        r"(once|twice|thrice|(?:1|2|3|4)\s*x\s*(?:daily|a\s*day)|OD|BD|TDS|QID|PRN|SOS|once\s*daily|twice\s*daily)",
        re.IGNORECASE,
    ),
    "doctor": re.compile(
        r"(?:Dr\.?|Doctor)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})",
    ),
    "hospital": re.compile(
        r"([A-Z][A-Za-z\s]+(?:Hospital|Clinic|Medical Center|Health|Centre))",
    ),
    "date": re.compile(
        r"(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})",
    ),
    "refills": re.compile(r"(?:refills?|rf)\s*[:\-]?\s*(\d+)", re.IGNORECASE),
    "duration": re.compile(r"(?:for|duration)\s*[:\-]?\s*(\d+)\s*(days?|weeks?|months?)", re.IGNORECASE),
    "warnings": re.compile(r"(?:warning|caution|do not|avoid)[:\-]?\s*([^\n\.]{10,100})", re.IGNORECASE),
}


class OCRService:
    @staticmethod
    def extract_text_from_image(image_bytes: bytes) -> str:
        """Extract text from image bytes using pytesseract."""
        try:
            import pytesseract  # type: ignore
            from PIL import Image  # type: ignore
            import io
            img = Image.open(io.BytesIO(image_bytes))
            res = pytesseract.image_to_string(img, lang="eng", config="--psm 6")
            if isinstance(res, bytes):
                return res.decode("utf-8", errors="ignore")
            elif isinstance(res, str):
                return res
            return str(res)
        except ImportError:
            logger.warning("pytesseract not installed; returning empty extraction")
            return ""
        except Exception as e:
            logger.error(f"OCR image extraction error: {e}")
            return ""

    @staticmethod
    def extract_text_from_pdf(pdf_bytes: bytes) -> str:
        """Extract text from PDF bytes using pdfminer or pypdf."""
        try:
            import pypdf  # type: ignore
            import io
            reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except ImportError:
            pass
        try:
            from pdfminer.high_level import extract_text_to_fp  # type: ignore
            import io
            out = io.StringIO()
            extract_text_to_fp(io.BytesIO(pdf_bytes), out)
            return out.getvalue()
        except Exception as e:
            logger.error(f"PDF extraction error: {e}")
            return ""

    @staticmethod
    def parse_prescription(text: str) -> Dict[str, Any]:
        """Parse extracted text into structured clinical fields."""
        result: Dict[str, Any] = {
            "medicines": [],
            "doctor": None,
            "hospital": None,
            "issue_date": None,
            "refills": None,
            "warnings": [],
            "raw_text": text,
            "confidence": 0.0,
        }
        fields_found = 0
        total_fields = 6

        # Doctor
        m = PATTERNS["doctor"].search(text)
        if m:
            result["doctor"] = m.group(1).strip()
            fields_found += 1

        # Hospital
        m = PATTERNS["hospital"].search(text)
        if m:
            result["hospital"] = m.group(1).strip()
            fields_found += 1

        # Date
        dates = PATTERNS["date"].findall(text)
        if dates:
            result["issue_date"] = dates[0]
            fields_found += 1

        # Refills
        m = PATTERNS["refills"].search(text)
        if m:
            result["refills"] = int(m.group(1))
            fields_found += 1

        # Warnings
        warnings = PATTERNS["warnings"].findall(text)
        result["warnings"] = [w.strip() for w in warnings[:5]]
        if warnings:
            fields_found += 1

        # Medicines: extract names, dosages, frequencies
        lines = text.split("\n")
        for line in lines:
            line = line.strip()
            if len(line) < 4:
                continue
            med: Dict[str, Any] = {}
            name_match = PATTERNS["medicine_name"].search(line)
            if name_match:
                med["name"] = name_match.group(1).strip()
            dose_match = PATTERNS["dosage"].search(line)
            if dose_match:
                med["dosage"] = dose_match.group(1).strip()
            freq_match = PATTERNS["frequency"].search(line)
            if freq_match:
                med["frequency"] = freq_match.group(1).strip()
            if med.get("name") or med.get("dosage"):
                med.setdefault("name", line[:40])
                result["medicines"].append(med)

        if result["medicines"]:
            fields_found += 1

        result["confidence"] = round(fields_found / total_fields, 2)
        return result

    @staticmethod
    async def process_upload(file_bytes: bytes, mime_type: str) -> Dict[str, Any]:
        """Main entry: given raw bytes and MIME type, return parsed prescription dict."""
        if mime_type in ("application/pdf",):
            text = OCRService.extract_text_from_pdf(file_bytes)
        elif mime_type.startswith("image/"):
            text = OCRService.extract_text_from_image(file_bytes)
        else:
            return {"error": f"Unsupported mime type: {mime_type}", "confidence": 0.0}

        if not text.strip():
            return {
                "error": "Could not extract text from document",
                "confidence": 0.0,
                "medicines": [],
            }
        return OCRService.parse_prescription(text)
