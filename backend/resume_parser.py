import io

import docx
import pdfplumber

SUPPORTED_EXTENSIONS = {".pdf", ".docx"}


def extract_text(file_bytes: bytes, filename: str = "") -> str:
    if filename.lower().endswith(".docx"):
        return _extract_docx(file_bytes)
    return _extract_pdf(file_bytes)


def _extract_pdf(file_bytes: bytes) -> str:
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        pages = [page.extract_text() or "" for page in pdf.pages]
    return "\n".join(pages).strip()


def _extract_docx(file_bytes: bytes) -> str:
    doc = docx.Document(io.BytesIO(file_bytes))
    return "\n".join(para.text for para in doc.paragraphs if para.text.strip())

