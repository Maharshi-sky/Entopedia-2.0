"""
Knowledge Hub API: upload files, list and remove them, and ask questions answered from their text.
Documents are shared by everyone with access to the Knowledge Hub module; only the uploader or an
admin may remove one.
"""
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, Body, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from app.db.connection import db
from app.middleware.auth import AuthUser, get_current_user
from app.services import knowledge, llm
from app.services.activity import log_activity, log_ai_query
from app.utils.logger import logger
from app.utils.tasks import spawn

router = APIRouter(dependencies=[Depends(get_current_user)])

UUID_LEN = 36
DOC_COLUMNS = """d.id, d.filename, d.file_type, d.file_size, d.status, d.error, d.pages, d.chunks, d.chars,
                 d.created_at, d.indexed_at, d.user_id, u.name AS uploaded_by"""

ASK_SYSTEM = """You answer questions for an R&D team using ONLY the document excerpts given.
Each excerpt starts with a label such as [S1]. Cite every fact with that label, e.g. "... 80% efficacy [S2]".
Never cite anything else: numbers like [114] inside the excerpts are the document's own references, not sources.
If the excerpts do not contain the answer, say that the uploaded documents don't cover it.
Be concise: a short answer, then bullet points if useful."""


async def _document(document_id: str) -> dict:
    if len(document_id) != UUID_LEN:
        raise HTTPException(status_code=404, detail="Document not found")
    row = await db.query_one(
        f"SELECT {DOC_COLUMNS}, d.storage_path FROM knowledge_documents d LEFT JOIN users u ON u.id = d.user_id WHERE d.id::text = $1",
        [document_id],
    )
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    return row


@router.get("/documents")
async def list_documents():
    # A document left 'processing' by a stopped server is marked failed, so it doesn't spin forever.
    await db.execute(
        """UPDATE knowledge_documents SET status = 'failed', error = 'interrupted (the server stopped); upload it again'
            WHERE status = 'processing' AND created_at < NOW() - interval '30 minutes'"""
    )
    rows = await db.query_many(
        f"SELECT {DOC_COLUMNS} FROM knowledge_documents d LEFT JOIN users u ON u.id = d.user_id ORDER BY d.created_at DESC LIMIT 500"
    )
    return {"data": rows}


@router.post("/documents", status_code=202)
async def upload_document(request: Request, file: UploadFile = File(...), user: AuthUser = Depends(get_current_user)):
    name = Path(file.filename or "upload").name[:255]
    file_type = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if file_type not in knowledge.ALLOWED_TYPES:
        hint = " Save old .xls/.doc files as .xlsx/.docx first." if file_type in ("xls", "doc") else ""
        raise HTTPException(status_code=400, detail=f"Use a PDF, Excel (.xlsx), Word (.docx), CSV or text file.{hint}")

    data = await file.read(knowledge.MAX_BYTES + 1)
    if len(data) > knowledge.MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"Files can be up to {knowledge.MAX_BYTES // (1024 * 1024)} MB")
    if not data:
        raise HTTPException(status_code=400, detail="The file is empty")

    document_id = str(uuid.uuid4())
    path = knowledge.upload_dir() / f"{document_id}.{file_type}"
    path.write_bytes(data)
    try:
        row = await db.query_one(
            """INSERT INTO knowledge_documents (id, user_id, filename, file_type, file_size, storage_path, status)
               VALUES ($1, $2, $3, $4, $5, $6, 'processing')
               RETURNING id, filename, file_type, file_size, status, created_at""",
            [document_id, user.id, name, file_type, len(data), str(path)],
        )
    except Exception as error:  # noqa: BLE001
        path.unlink(missing_ok=True)
        logger.error(f"Knowledge upload error: {error}")
        raise HTTPException(status_code=500, detail="Failed to save the file")

    spawn(knowledge.index_document(document_id, path, file_type))
    await log_activity(user.id, "knowledge.upload", resource_type="document", resource_id=document_id,
                       details={"filename": name, "size": len(data)}, request=request)
    return row


@router.get("/documents/{document_id}/download")
async def download_document(document_id: str):
    doc = await _document(document_id)
    path = Path(doc["storage_path"])
    if not path.is_file():
        raise HTTPException(status_code=404, detail="The stored file is missing")
    return FileResponse(path, filename=doc["filename"])


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str, request: Request, user: AuthUser = Depends(get_current_user)):
    doc = await _document(document_id)
    if user.role != "admin" and str(doc["user_id"]) != user.id:
        raise HTTPException(status_code=403, detail="Only the person who uploaded it, or an admin, can remove it")
    await db.execute("DELETE FROM knowledge_documents WHERE id::text = $1", [document_id])
    Path(doc["storage_path"]).unlink(missing_ok=True)
    await log_activity(user.id, "knowledge.delete", resource_type="document", resource_id=document_id,
                       details={"filename": doc["filename"]}, request=request)
    return {"deleted": document_id}


async def _own_chat(chat_id: str, user: AuthUser) -> dict:
    """The user's own chat, or 404 (chats are private to the person who started them)."""
    if len(chat_id) != UUID_LEN:
        raise HTTPException(status_code=404, detail="Chat not found")
    chat = await db.query_one(
        "SELECT id, title, created_at, updated_at FROM knowledge_chats WHERE id::text = $1 AND user_id::text = $2",
        [chat_id, user.id],
    )
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


async def _save_answer(user: AuthUser, chat_id: str | None, question: str, answer: str, **log) -> str:
    """Stores the answer in its chat, starting a chat titled after the question when there is none yet."""
    if chat_id is None:
        title = " ".join(question.split())[:80] or "New chat"
        row = await db.query_one(
            "INSERT INTO knowledge_chats (user_id, title) VALUES ($1, $2) RETURNING id", [user.id, title]
        )
        chat_id = str(row["id"])
    else:
        await db.execute("UPDATE knowledge_chats SET updated_at = NOW() WHERE id::text = $1", [chat_id])
    await log_ai_query(user.id, ["knowledge-hub"], question, answer, chat_id=chat_id, **log)
    return chat_id


@router.post("/ask")
async def ask(body: dict = Body(...), user: AuthUser = Depends(get_current_user)):
    """Answers from the indexed documents (optionally only `document_ids`), in chat `chat_id` or a new one."""
    question = str(body.get("question") or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required")
    ids = body.get("document_ids")
    ids = [i for i in ids if isinstance(i, str)][:50] if isinstance(ids, list) else None
    chat_id = body.get("chat_id") if isinstance(body.get("chat_id"), str) else None
    if chat_id:
        await _own_chat(chat_id, user)

    hits = await knowledge.search(question[:1000], limit=4, document_ids=ids)
    if not hits:
        answer = "None of the selected documents mention this. Upload a document that covers it, or rephrase the question."
        chat_id = await _save_answer(user, chat_id, question, answer, confidence="low", tokens_used=0)
        return {"answer": answer, "sources": [], "model": None, "chat_id": chat_id}

    # Excerpts are numbered S1, S2… so citations in the answer match the source list returned with it.
    def where(h: dict) -> str:
        return f"{h['filename']}, page {h['page']}" if h["page"] else h["filename"]

    excerpts = "\n\n".join(f"[S{i + 1}] ({where(h)})\n{h['content']}" for i, h in enumerate(hits))
    try:
        result = await llm.complete(
            f"Excerpts:\n{excerpts}\n\nQuestion: {question}", system=ASK_SYSTEM, max_tokens=900, timeout_ms=240_000,
        )
    except llm.LLMUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error))
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="The local AI took too long to answer. Try a shorter, more specific question.")
    except Exception as error:  # noqa: BLE001
        logger.error(f"Knowledge ask error: {error!r}")
        raise HTTPException(status_code=500, detail="Failed to answer from the documents")

    sources = [
        {"ref": f"S{i + 1}", "document_id": str(h["document_id"]), "filename": h["filename"], "page": h["page"]}
        for i, h in enumerate(hits)
    ]
    chat_id = await _save_answer(user, chat_id, question, result.text, tokens_used=result.tokens, sources=sources)
    return {"answer": result.text, "sources": sources, "model": result.model, "chat_id": chat_id}


@router.get("/chats")
async def list_chats(user: AuthUser = Depends(get_current_user)):
    """The user's own chats, most recently used first."""
    rows = await db.query_many(
        """SELECT c.id, c.title, c.created_at, c.updated_at,
                  (SELECT COUNT(*)::int FROM ai_queries q WHERE q.chat_id = c.id) AS questions
             FROM knowledge_chats c
            WHERE c.user_id::text = $1
            ORDER BY c.updated_at DESC
            LIMIT 100""",
        [user.id],
    )
    return {"data": rows}


@router.get("/chats/{chat_id}")
async def get_chat(chat_id: str, user: AuthUser = Depends(get_current_user)):
    """One chat's questions and answers, oldest first, with their sources."""
    chat = await _own_chat(chat_id, user)
    messages = await db.query_many(
        """SELECT id, query_text AS question, response AS answer, COALESCE(sources, '[]'::jsonb) AS sources, created_at
             FROM ai_queries WHERE chat_id::text = $1 ORDER BY created_at ASC""",
        [chat_id],
    )
    return {**chat, "messages": messages}


@router.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str, user: AuthUser = Depends(get_current_user)):
    """Removes the chat from the list. Its questions stay in the audit log (no longer grouped)."""
    await _own_chat(chat_id, user)
    await db.execute("DELETE FROM knowledge_chats WHERE id::text = $1", [chat_id])
    return {"deleted": chat_id}
