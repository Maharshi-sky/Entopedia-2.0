import uuid

from fastapi import APIRouter, Body, Depends, HTTPException

from app.db.connection import db
from app.services.anthropic_client import anthropic_client
from app.middleware.auth import AuthUser, get_current_user
from app.utils.logger import logger

router = APIRouter(dependencies=[Depends(get_current_user)])

_anthropic = anthropic_client  # loaded on first use
MODEL = "claude-opus-4-1"


@router.post("/ask")
async def ask(body: dict = Body(...), user: AuthUser = Depends(get_current_user)):
    try:
        question = body.get("question")
        modules = body.get("modules", [])

        context = ""
        if "competitor" in modules:
            competitors = await db.query_many("SELECT name, threat_score FROM competitors LIMIT 5")
            context += f"Top competitors: {competitors}\n"
        if "patent" in modules:
            patents = await db.query_many("SELECT patent_number, title, filer FROM patents LIMIT 10")
            context += f"Recent patents: {patents}\n"
        if "news" in modules:
            news = await db.query_many("SELECT title, source FROM news LIMIT 10")
            context += f"Recent news: {news}\n"

        message = await _anthropic.messages.create(
            model=MODEL, max_tokens=1024,
            system="You are an AI assistant for Entopedia, a pest intelligence platform. Use the provided context to answer questions accurately. Always cite your sources.",
            messages=[{"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"}],
        )

        response = message.content[0].text if message.content and message.content[0].type == "text" else ""

        query_id = str(uuid.uuid4())
        await db.execute(
            "INSERT INTO ai_queries (id, user_id, modules, query_text, response, confidence_level, tokens_used, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())",
            [query_id, user.id, modules, question, response, "high", message.usage.output_tokens if message.usage else 0],
        )

        return {
            "query_id": query_id, "answer": response, "sources": [], "confidence_level": "high",
            "tokens_used": message.usage.output_tokens if message.usage else 0,
        }
    except Exception as error:  # noqa: BLE001
        logger.error(f"AI ask error: {error}")
        raise HTTPException(status_code=500, detail="Failed to process question")


@router.post("/summarize")
async def summarize(body: dict = Body(...)):
    try:
        content = body.get("content")
        type_ = body.get("type", "text")

        message = await _anthropic.messages.create(
            model=MODEL, max_tokens=500,
            messages=[{"role": "user", "content": f"Provide a concise summary of the following {type_}:\n\n{content}"}],
        )

        summary = message.content[0].text if message.content and message.content[0].type == "text" else ""
        return {"summary": summary}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Summarization error: {error}")
        raise HTTPException(status_code=500, detail="Failed to summarize")


@router.get("/query-log")
async def query_log(limit: int = 50, offset: int = 0, user: AuthUser = Depends(get_current_user)):
    try:
        queries = await db.query_many(
            "SELECT id, query_text, modules, confidence_level, created_at FROM ai_queries WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
            [user.id, limit, offset],
        )
        return {"queries": queries}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Query log error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch query log")
