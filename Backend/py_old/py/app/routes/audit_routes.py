from fastapi import APIRouter, Depends, HTTPException

from app.db.connection import db
from app.middleware.auth import require_roles
from app.utils.logger import logger

router = APIRouter(dependencies=[Depends(require_roles("admin", "regulatory_specialist"))])


@router.get("/ai-queries")
async def ai_queries(user_id: str | None = None, module: str | None = None, limit: int = 50, offset: int = 0):
    try:
        params: list = []
        # Each row carries the asking user's name and the titles of its sources,
        # so the audit view can render without a request per row.
        query = """SELECT q.*, u.name AS user_name,
            COALESCE((SELECT ARRAY_AGG(s.title ORDER BY s.relevance_score DESC NULLS LAST) FROM ai_sources s WHERE s.query_id = q.id), '{}') AS source_titles
          FROM ai_queries q LEFT JOIN users u ON u.id = q.user_id WHERE 1=1"""

        if user_id:
            params.append(user_id)
            query += f" AND q.user_id = ${len(params)}"
        if module:
            params.append(module)
            query += f" AND ${len(params)} = ANY(q.modules)"

        params.extend([limit, offset])
        query += f" ORDER BY q.created_at DESC LIMIT ${len(params) - 1} OFFSET ${len(params)}"

        queries = await db.query_many(query, params)
        total = await db.query_one("SELECT COUNT(*) as count FROM ai_queries")

        return {"data": queries, "pagination": {"limit": limit, "offset": offset, "total": total["count"] if total else 0}}
    except Exception as error:  # noqa: BLE001
        logger.error(f"AI queries audit error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch audit log")


@router.get("/ai-queries/{query_id}")
async def ai_query_detail(query_id: str):
    try:
        query = await db.query_one("SELECT * FROM ai_queries WHERE id = $1", [query_id])
        if not query:
            raise HTTPException(status_code=404, detail="Query not found")

        sources = await db.query_many("SELECT * FROM ai_sources WHERE query_id = $1", [query_id])
        return {**query, "sources": sources}
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(f"AI query detail error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch query details")


@router.get("/access-log")
async def access_log(user_id: str | None = None, module_id: str | None = None, limit: int = 50, offset: int = 0):
    try:
        params: list = []
        query = "SELECT * FROM access_log WHERE 1=1"

        # Note: ported as-is; the original TS references an undefined `q.user_id` here too.
        if user_id:
            params.append(user_id)
            query += f" AND q.user_id = ${len(params)}"
        if module_id:
            params.append(module_id)
            query += f" AND module_id = ${len(params)}"

        params.extend([limit, offset])
        query += f" ORDER BY accessed_at DESC LIMIT ${len(params) - 1} OFFSET ${len(params)}"

        logs = await db.query_many(query, params)
        total = await db.query_one("SELECT COUNT(*) as count FROM access_log")

        return {"data": logs, "pagination": {"limit": limit, "offset": offset, "total": total["count"] if total else 0}}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Access log error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch access log")


@router.get("/data-provenance/{source_id}")
async def data_provenance(source_id: str):
    try:
        provenance = await db.query_one("SELECT * FROM data_provenance WHERE source_id = $1", [source_id])
        if not provenance:
            raise HTTPException(status_code=404, detail="Provenance not found")
        return provenance
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(f"Provenance fetch error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch provenance")
