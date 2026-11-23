from fastapi import APIRouter, Body, Depends, HTTPException

from app.db.connection import db
from app.middleware.auth import AuthUser, get_current_user
from app.services import llm
from app.services.activity import log_ai_query
from app.utils.logger import logger

router = APIRouter(dependencies=[Depends(get_current_user)])

# Answers come from the provider in AI_PROVIDER (default: local Ollama); see app/services/llm.py.
ASK_SYSTEM = """You are the AI assistant of Entopedia, a pest-control and competitive intelligence platform.
Answer from the context given. Cite the record you used in square brackets, e.g. [news: <title>] or
[patent: <number>]. If the context does not answer the question, say so plainly instead of guessing."""


@router.get("/status")
async def ai_status():
    """The provider and model that answer AI requests, and whether they can right now."""
    return await llm.status()


async def _context(modules: list[str]) -> str:
    parts: list[str] = []
    if "competitor" in modules:
        rows = await db.query_many("SELECT name, threat_score FROM competitors ORDER BY threat_score DESC NULLS LAST LIMIT 10")
        parts.append("Competitors:\n" + "\n".join(f"- {r['name']} (threat {r['threat_score']})" for r in rows))
    if "patent" in modules:
        rows = await db.query_many("SELECT patent_number, title, filer FROM patents ORDER BY filing_date DESC NULLS LAST LIMIT 15")
        parts.append("Patents:\n" + "\n".join(f"- [{r['patent_number']}] {r['title']} ({r['filer']})" for r in rows))
    if "news" in modules:
        rows = await db.query_many("SELECT title, source, brand FROM news ORDER BY published_date DESC NULLS LAST LIMIT 15")
        parts.append("News:\n" + "\n".join(f"- {r['title']} ({r['source']}{', ' + r['brand'] if r['brand'] else ''})" for r in rows))
    return "\n\n".join(parts) or "(no context requested)"


@router.post("/ask")
async def ask(body: dict = Body(...), user: AuthUser = Depends(get_current_user)):
    question = str(body.get("question") or "").strip()
    modules = [m for m in body.get("modules", []) if isinstance(m, str)] if isinstance(body.get("modules"), list) else []
    if not question:
        raise HTTPException(status_code=400, detail="question is required")
    try:
        context = await _context(modules)
        result = await llm.complete(f"Context:\n{context}\n\nQuestion: {question}", system=ASK_SYSTEM, max_tokens=1024)
        query_id = await log_ai_query(user.id, modules or ["ai"], question, result.text, tokens_used=result.tokens)
        return {
            "query_id": query_id, "answer": result.text, "model": result.model, "sources": [],
            "confidence_level": "medium", "tokens_used": result.tokens,
        }
    except llm.LLMUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error))
    except Exception as error:  # noqa: BLE001
        logger.error(f"AI ask error: {error}")
        raise HTTPException(status_code=500, detail="Failed to process question")


@router.post("/summarize")
async def summarize(body: dict = Body(...), user: AuthUser = Depends(get_current_user)):
    content = str(body.get("content") or "").strip()
    type_ = str(body.get("type") or "text")[:40]
    if not content:
        raise HTTPException(status_code=400, detail="content is required")
    try:
        result = await llm.complete(
            f"Provide a concise summary of the following {type_}:\n\n{content[:20000]}", max_tokens=500,
        )
        await log_ai_query(user.id, ["ai"], f"[Summarize · {type_}] {content[:300]}", result.text, tokens_used=result.tokens)
        return {"summary": result.text, "model": result.model}
    except llm.LLMUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error))
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
