"""
User activity for the Admin page. Every write here is best effort: a failed log line is reported
and swallowed, so logging can never break the request it describes.

  log_activity    user_activity_log: logins, failed logins, logouts, admin changes
  log_visit       access_log: a user opened a module (at most one row per user, module and 5 minutes)
  log_ai_query    ai_queries: one AI call, from any module
"""
import uuid
from typing import Any, Optional, Sequence

from fastapi import Request

from app.db.connection import db
from app.utils.logger import logger

VISIT_WINDOW_MINUTES = 5


def client_of(request: Optional[Request]) -> tuple[Optional[str], Optional[str]]:
    """The caller's IP and user agent. The frontend calls the API from its server, so it forwards the
    browser's address as X-Forwarded-For; without it this is the frontend server's address."""
    if request is None:
        return None, None
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() or (request.client.host if request.client else None)
    return ip, (request.headers.get("user-agent") or "")[:500] or None


async def log_activity(
    user_id: Optional[str],
    action: str,
    *,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
    request: Optional[Request] = None,
) -> None:
    ip, agent = client_of(request)
    try:
        await db.execute(
            """INSERT INTO user_activity_log (user_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())""",
            [user_id, action, resource_type, resource_id, details or {}, ip, agent],
        )
    except Exception as error:  # noqa: BLE001
        logger.warning(f"Activity log ({action}) not saved: {error}")


async def log_visit(user_id: str, module_slug: str) -> bool:
    """Records that the user opened a module. False when the module is unknown or was logged recently."""
    try:
        row = await db.query_one(
            """INSERT INTO access_log (id, user_id, module_id, action, accessed_at)
               SELECT gen_random_uuid(), $1, m.id, 'view', NOW() FROM modules m
                WHERE m.slug = $2
                  AND NOT EXISTS (
                    SELECT 1 FROM access_log a
                     WHERE a.user_id = $1 AND a.module_id = m.id
                       AND a.accessed_at > NOW() - make_interval(mins => $3))
               RETURNING id""",
            [user_id, module_slug, VISIT_WINDOW_MINUTES],
        )
        return row is not None
    except Exception as error:  # noqa: BLE001
        logger.warning(f"Module visit ({module_slug}) not saved: {error}")
        return False


async def log_ai_query(
    user_id: Optional[str],
    modules: Sequence[str],
    query_text: str,
    response: str,
    *,
    confidence: str = "medium",
    tokens_used: Optional[int] = None,
    sources: Optional[list[dict]] = None,
    chat_id: Optional[str] = None,
) -> Optional[str]:
    """One AI call in ai_queries (the Audit page and the Admin page's query count read it). `sources`
    are the citations the answer used and `chat_id` the conversation it belongs to, so it can be
    shown again later."""
    query_id = str(uuid.uuid4())
    try:
        await db.execute(
            """INSERT INTO ai_queries (id, user_id, modules, query_text, response, confidence_level, tokens_used, sources, chat_id, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())""",
            [query_id, user_id, list(modules), query_text[:4000], response,
             confidence, tokens_used if tokens_used is not None else -(-len(response) // 4), sources, chat_id],
        )
        return query_id
    except Exception as error:  # noqa: BLE001
        logger.warning(f"AI query log not saved: {error}")
        return None
