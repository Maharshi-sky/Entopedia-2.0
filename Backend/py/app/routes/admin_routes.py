"""
Admin: users, their module access, and what they have been doing. Admins only.

Every change an admin makes is written to user_activity_log (action 'admin.*') with the values
before and after, so the Admin page's activity list shows who changed what.
"""
from fastapi import APIRouter, Body, Depends, HTTPException, Request

from app.db.connection import db
from app.middleware.auth import AuthUser, forget_account, require_roles
from app.services.activity import log_activity
from app.utils.logger import logger
from app.utils.range import to_interval

router = APIRouter(dependencies=[Depends(require_roles("admin"))])

ROLES = ("admin", "marketing", "regulatory_specialist")
ACCESS_LEVELS = ("full", "standard", "read")


def _clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


async def _user_row(user_id: str) -> dict:
    row = await db.query_one("SELECT id, email, name, role, is_active FROM users WHERE id::text = $1", [user_id])
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return row


async def _other_active_admins(user_id: str) -> int:
    row = await db.query_one(
        "SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND is_active AND id::text <> $1", [user_id]
    )
    return row["n"] if row else 0


@router.get("/users")
async def list_users(limit: int = 50, offset: int = 0):
    try:
        limit, offset = _clamp(limit, 1, 500), _clamp(offset, 0, 100_000)
        # `modules` lists the slugs each user can open (access_level <> 'none'); `last_active` is the
        # latest of any recorded activity, module visit or AI query.
        users = await db.query_many(
            """SELECT u.id, u.email, u.name, u.role, u.is_active, u.created_at, u.last_login_at,
                      COALESCE(ARRAY_AGG(m.slug ORDER BY m.name) FILTER (WHERE m.id IS NOT NULL), '{}') AS modules,
                      COALESCE(ARRAY_AGG(DISTINCT ma.access_level) FILTER (WHERE ma.access_level IS NOT NULL), '{}') AS access_levels,
                      GREATEST(
                        (SELECT MAX(created_at) FROM user_activity_log l WHERE l.user_id = u.id AND l.action <> 'login_failed'),
                        (SELECT MAX(accessed_at) FROM access_log a WHERE a.user_id = u.id),
                        (SELECT MAX(created_at) FROM ai_queries q WHERE q.user_id = u.id)
                      ) AS last_active
                 FROM users u
                 LEFT JOIN module_access ma ON ma.user_id = u.id AND ma.access_level <> 'none'
                 LEFT JOIN modules m ON m.id = ma.module_id
                GROUP BY u.id
                ORDER BY u.created_at ASC
                LIMIT $1 OFFSET $2""",
            [limit, offset],
        )
        total = await db.query_one("SELECT COUNT(*)::int AS count FROM users")
        return {"data": users, "pagination": {"limit": limit, "offset": offset, "total": total["count"] if total else 0}}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Users list error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch users")


@router.patch("/users/{user_id}")
async def update_user(user_id: str, request: Request, body: dict = Body(...), admin: AuthUser = Depends(require_roles("admin"))):
    """Changes a user's name, role or active flag. Admins cannot demote or deactivate themselves,
    and the last active admin cannot be demoted or deactivated."""
    before = await _user_row(user_id)
    changes: dict = {}

    if "name" in body:
        name = str(body.get("name") or "").strip()
        if not name or len(name) > 255:
            raise HTTPException(status_code=400, detail="Name must be 1 to 255 characters")
        changes["name"] = name
    if "role" in body:
        if body["role"] not in ROLES:
            raise HTTPException(status_code=400, detail=f"Role must be one of {', '.join(ROLES)}")
        changes["role"] = body["role"]
    if "is_active" in body:
        if not isinstance(body["is_active"], bool):
            raise HTTPException(status_code=400, detail="is_active must be true or false")
        changes["is_active"] = body["is_active"]

    changes = {k: v for k, v in changes.items() if before[k] != v}
    if not changes:
        return {"user": before, "changed": []}

    loses_admin = before["role"] == "admin" and before["is_active"] and (
        changes.get("role", "admin") != "admin" or changes.get("is_active", True) is False
    )
    if loses_admin:
        if str(before["id"]) == admin.id:
            raise HTTPException(status_code=400, detail="You can't remove your own admin access or deactivate yourself")
        if await _other_active_admins(user_id) == 0:
            raise HTTPException(status_code=400, detail="At least one active admin must remain")

    sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(changes))
    try:
        after = await db.query_one(
            f"UPDATE users SET {sets}, updated_at = NOW() WHERE id::text = $1 RETURNING id, email, name, role, is_active",
            [user_id, *changes.values()],
        )
    except Exception as error:  # noqa: BLE001
        logger.error(f"User update error: {error}")
        raise HTTPException(status_code=500, detail="Failed to update user")

    forget_account(user_id)
    await log_activity(
        admin.id, "admin.update_user", resource_type="user", resource_id=user_id,
        details={"email": before["email"], "before": {k: before[k] for k in changes}, "after": changes},
        request=request,
    )
    return {"user": after, "changed": list(changes)}


@router.put("/users/{user_id}/modules")
async def set_modules(user_id: str, request: Request, body: dict = Body(...), admin: AuthUser = Depends(require_roles("admin"))):
    """Replaces the user's module access: `modules` (slugs) at `access_level` (full | standard | read).
    Modules left out lose access."""
    target = await _user_row(user_id)
    slugs = body.get("modules")
    level = body.get("access_level")
    if not isinstance(slugs, list) or not all(isinstance(s, str) for s in slugs):
        raise HTTPException(status_code=400, detail="modules must be a list of module slugs")
    if level not in ACCESS_LEVELS:
        raise HTTPException(status_code=400, detail=f"access_level must be one of {', '.join(ACCESS_LEVELS)}")

    known = {r["slug"]: r["id"] for r in await db.query_many("SELECT id, slug FROM modules")}
    unknown = sorted(set(slugs) - set(known))
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown modules: {', '.join(unknown)}")

    before = await db.query_many(
        """SELECT m.slug, ma.access_level FROM module_access ma JOIN modules m ON m.id = ma.module_id
            WHERE ma.user_id::text = $1 AND ma.access_level <> 'none' ORDER BY m.slug""",
        [user_id],
    )
    wanted = sorted(set(slugs))
    try:
        pool = db.get_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute("DELETE FROM module_access WHERE user_id::text = $1", user_id)
                if wanted:
                    await conn.execute(
                        """INSERT INTO module_access (user_id, module_id, access_level)
                           SELECT $1::uuid, id, $3 FROM modules WHERE slug = ANY($2::text[])""",
                        user_id, wanted, level,
                    )
    except Exception as error:  # noqa: BLE001
        logger.error(f"Module access update error: {error}")
        raise HTTPException(status_code=500, detail="Failed to update module access")

    forget_account(user_id)
    await log_activity(
        admin.id, "admin.update_access", resource_type="user", resource_id=user_id,
        details={
            "email": target["email"],
            "before": {r["slug"]: r["access_level"] for r in before},
            "after": {s: level for s in wanted},
        },
        request=request,
    )
    return {"modules": wanted, "access_level": level}


@router.get("/users/{user_id}/access")
async def get_access(user_id: str):
    try:
        access = await db.query_many(
            """SELECT m.slug, m.name, ma.access_level FROM module_access ma JOIN modules m ON m.id = ma.module_id
                WHERE ma.user_id::text = $1 ORDER BY m.name""",
            [user_id],
        )
        return {"access": access}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Access fetch error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch access")


@router.get("/modules")
async def list_modules():
    try:
        # "group" is a reserved word in SQL and must be quoted.
        modules = await db.query_many('SELECT id, name, slug, "group" FROM modules ORDER BY "group", name')
        return {"modules": modules}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Modules list error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch modules")


@router.get("/activity")
async def recent_activity(limit: int = 50, offset: int = 0, user_id: str | None = None):
    """Logins, logouts, admin changes, module visits and AI queries, newest first, in one list."""
    try:
        limit, offset = _clamp(limit, 1, 200), _clamp(offset, 0, 100_000)
        params: list = [limit, offset]
        only_user = ""
        if user_id:
            params.append(user_id)
            only_user = f"WHERE e.user_id::text = ${len(params)}"
        rows = await db.query_many(
            f"""WITH e AS (
                  SELECT l.id::text, l.user_id, l.action, l.details, l.ip_address, l.created_at AS at, NULL::text AS module
                    FROM user_activity_log l
                  UNION ALL
                  SELECT a.id::text, a.user_id, 'module_visit', NULL::jsonb, NULL, a.accessed_at, m.name
                    FROM access_log a LEFT JOIN modules m ON m.id = a.module_id
                  UNION ALL
                  SELECT q.id::text, q.user_id, 'ai_query', jsonb_build_object('query', LEFT(q.query_text, 200)), NULL,
                         q.created_at, array_to_string(q.modules, ', ')
                    FROM ai_queries q
                )
                SELECT e.id, e.user_id, u.name AS user_name, u.email AS user_email, e.action, e.module, e.details,
                       e.ip_address, e.at
                  FROM e LEFT JOIN users u ON u.id = e.user_id
                  {only_user}
                 ORDER BY e.at DESC NULLS LAST
                 LIMIT $1 OFFSET $2""",
            params,
        )
        return {"data": rows, "pagination": {"limit": limit, "offset": offset}}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Activity list error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch activity")


@router.get("/usage-metrics")
async def usage_metrics(period: str = "30d"):
    """KPIs and per-module usage for the period. A user counts as active with any login, module
    visit or AI query in the period; module usage is the share of those users who opened the module."""
    try:
        interval = to_interval(period)
        active = await db.query_one(
            """SELECT COUNT(DISTINCT user_id)::int AS count FROM (
                 SELECT user_id FROM user_activity_log WHERE action IN ('login', 'logout') AND created_at > NOW() - $1::text::interval
                 UNION SELECT user_id FROM access_log WHERE accessed_at > NOW() - $1::text::interval
                 UNION SELECT user_id FROM ai_queries WHERE created_at > NOW() - $1::text::interval
               ) a WHERE user_id IS NOT NULL""",
            [interval],
        )
        queries = await db.query_one(
            "SELECT COUNT(*)::int AS count FROM ai_queries WHERE created_at > NOW() - $1::text::interval", [interval]
        )
        logins = await db.query_one(
            "SELECT COUNT(*)::int AS count FROM user_activity_log WHERE action = 'login' AND created_at > NOW() - $1::text::interval",
            [interval],
        )
        module_usage = await db.query_many(
            """SELECT m.name AS module, m.slug, COUNT(DISTINCT a.user_id)::int AS users, COUNT(*)::int AS visits
                 FROM access_log a JOIN modules m ON m.id = a.module_id
                WHERE a.accessed_at > NOW() - $1::text::interval
                GROUP BY m.name, m.slug
                ORDER BY users DESC, visits DESC""",
            [interval],
        )
        totals = await db.query_one(
            "SELECT (SELECT COUNT(*)::int FROM users WHERE is_active) AS active_accounts, (SELECT COUNT(*)::int FROM modules) AS modules_total"
        )
        active_users = active["count"] if active else 0
        return {
            "period": period,
            "active_users": active_users,
            "total_queries": queries["count"] if queries else 0,
            "logins": logins["count"] if logins else 0,
            "active_accounts": totals["active_accounts"] if totals else 0,
            "modules_total": totals["modules_total"] if totals else 0,
            "modules_active": len(module_usage),
            "module_usage": [
                {**m, "pct": round(100 * m["users"] / active_users) if active_users else 0} for m in module_usage
            ],
        }
    except Exception as error:  # noqa: BLE001
        logger.error(f"Usage metrics error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch usage metrics")
