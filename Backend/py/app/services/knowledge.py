"""
Knowledge Hub: text from uploaded files, split into chunks, stored for full-text search, and
answers to questions grounded in the best-matching chunks (via app.services.llm).

  extract_text  file -> [(page, text)]   PDF pages, Excel sheets, Word, CSV, plain text
  index_document  extract + chunk + store; sets the document's status (runs in the background)
  search          chunks matching a question, best first
"""
import asyncio
import csv
import io
import os
import re
from pathlib import Path
from typing import Optional

from app.db.connection import db
from app.utils.logger import logger

ALLOWED_TYPES = {"pdf", "xlsx", "docx", "csv", "txt"}
MAX_BYTES = min(int(os.getenv("MAX_FILE_SIZE", "50000000")), 25 * 1024 * 1024)
CHUNK_CHARS = 1200
CHUNK_OVERLAP = 150


def upload_dir() -> Path:
    path = Path(os.getenv("UPLOAD_DIR") or "./uploads") / "knowledge"
    path.mkdir(parents=True, exist_ok=True)
    return path


# ── Text extraction (blocking; run in a thread) ─────────────────────────────

def _pdf(data: bytes) -> list[tuple[Optional[int], str]]:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    return [(i + 1, page.extract_text() or "") for i, page in enumerate(reader.pages)]


def _xlsx(data: bytes) -> list[tuple[Optional[int], str]]:
    from openpyxl import load_workbook

    book = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    out = []
    for i, sheet in enumerate(book.worksheets):
        lines = [f"Sheet: {sheet.title}"]
        for row in sheet.iter_rows(values_only=True):
            cells = [str(c).strip() for c in row if c is not None and str(c).strip()]
            if cells:
                lines.append(" | ".join(cells))
        out.append((i + 1, "\n".join(lines)))
    book.close()
    return out


def _docx(data: bytes) -> list[tuple[Optional[int], str]]:
    from docx import Document

    doc = Document(io.BytesIO(data))
    parts = [p.text for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            parts.append(" | ".join(c.text.strip() for c in row.cells if c.text.strip()))
    return [(None, "\n".join(parts))]


def _text(data: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _csv(data: bytes) -> list[tuple[Optional[int], str]]:
    rows = csv.reader(io.StringIO(_text(data)))
    return [(None, "\n".join(" | ".join(c.strip() for c in r if c.strip()) for r in rows))]


def extract_text(data: bytes, file_type: str) -> list[tuple[Optional[int], str]]:
    if file_type == "pdf":
        return _pdf(data)
    if file_type == "xlsx":
        return _xlsx(data)
    if file_type == "docx":
        return _docx(data)
    if file_type == "csv":
        return _csv(data)
    return [(None, _text(data))]


def chunk(pages: list[tuple[Optional[int], str]]) -> list[tuple[Optional[int], str]]:
    """Each page's text in pieces of about CHUNK_CHARS, overlapping a little, cut at sentence or line ends."""
    out: list[tuple[Optional[int], str]] = []
    for page, raw in pages:
        text = re.sub(r"[ \t]+", " ", raw.replace("\x00", "")).strip()
        text = re.sub(r"\n{3,}", "\n\n", text)
        start = 0
        while start < len(text):
            end = min(len(text), start + CHUNK_CHARS)
            if end < len(text):
                cut = max(text.rfind(". ", start + CHUNK_CHARS // 2, end), text.rfind("\n", start + CHUNK_CHARS // 2, end))
                if cut > start:
                    end = cut + 1
            piece = text[start:end].strip()
            if len(piece) > 40:
                out.append((page, piece))
            if end >= len(text):
                break
            start = max(end - CHUNK_OVERLAP, start + 1)
    return out


# ── Indexing ────────────────────────────────────────────────────────────────

async def index_document(document_id: str, path: Path, file_type: str) -> None:
    """Extracts, chunks and stores one document; never raises (the status says what happened)."""
    try:
        data = await asyncio.to_thread(path.read_bytes)
        pages = await asyncio.to_thread(extract_text, data, file_type)
        pieces = chunk(pages)
        if not pieces:
            raise ValueError("no readable text found (a scanned PDF or an image needs OCR, which isn't set up)")

        pool = db.get_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute("DELETE FROM knowledge_chunks WHERE document_id = $1::uuid", document_id)
                await conn.executemany(
                    "INSERT INTO knowledge_chunks (document_id, idx, page, content) VALUES ($1::uuid, $2, $3, $4)",
                    [(document_id, i, page, text) for i, (page, text) in enumerate(pieces)],
                )
                await conn.execute(
                    """UPDATE knowledge_documents SET status = 'indexed', error = NULL, pages = $2, chunks = $3,
                              chars = $4, indexed_at = NOW() WHERE id = $1::uuid""",
                    document_id, len(pages), len(pieces), sum(len(t) for _, t in pieces),
                )
        logger.info(f"Knowledge: indexed {path.name} ({len(pieces)} chunks)")
    except Exception as error:  # noqa: BLE001
        message = str(error) or error.__class__.__name__
        logger.warning(f"Knowledge: could not index {path.name}: {message}")
        try:
            await db.execute(
                "UPDATE knowledge_documents SET status = 'failed', error = $2 WHERE id = $1::uuid",
                [document_id, message[:500]],
            )
        except Exception:  # noqa: BLE001
            pass


# ── Search ──────────────────────────────────────────────────────────────────

async def search(question: str, limit: int = 6, document_ids: Optional[list[str]] = None) -> list[dict]:
    """Chunks that share words with the question (any of them, stemmed), best match first."""
    params: list = [question, limit]
    only = ""
    if document_ids:
        params.append(document_ids)
        only = "AND c.document_id::text = ANY($3::text[])"
    return await db.query_many(
        f"""WITH q AS (
              SELECT to_tsquery('english', string_agg(quote_literal(lexeme) || ':*', ' | ')) AS query
                FROM unnest(tsvector_to_array(to_tsvector('english', $1))) AS lexeme
            )
            SELECT c.document_id, d.filename, c.page, c.content, ts_rank_cd(c.tsv, q.query) AS rank
              FROM knowledge_chunks c
              JOIN knowledge_documents d ON d.id = c.document_id AND d.status = 'indexed'
              CROSS JOIN q
             WHERE q.query IS NOT NULL AND c.tsv @@ q.query {only}
             ORDER BY rank DESC
             LIMIT $2""",
        params,
    )
