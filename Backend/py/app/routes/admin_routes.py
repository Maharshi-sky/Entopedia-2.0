"""
Admin: users, their module access, and what they have been doing. Admins only.

Every change an admin makes is written to user_activity_log (action 'admin.*') with the values
before and after, so the Admin page's activity list shows who changed what.

Removing a user is a soft delete: the row keeps everything, with deleted_at set and is_active false,
so the user can't sign in and is left out of the user list until an admin restores them.
"""
import re
import uuid

import bcrypt
from fastapi import APIRouter, Body, Depends, HTTPException, Request

from app.db.connection import db
from app.middleware.auth import AuthUser, forget_account, require_roles
from app.services.activity import log_activity
from app.utils.logger import logger
from app.utils.range import to_interval

router = APIRouter(dependencies=[Depends(require_roles("admin"))])

ROLES = ("admin", "marketing", "regulatory_specialist")
ACCESS_LEVELS = ("full", "standard", "read")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


async def _user_row(user_id: str, *, removed: bool = False) -> dict:
    """The user, or a 404. Removed users are found only with removed=True (and then only they are)."""
    row = await db.query_one(
        "SELECT id, email, name, role, is_active, deleted_at FROM users WHERE id::text = $1", [user_id]
    )
    if not row or (row["deleted_at"] is not None) != removed:
        raise HTTPException(status_code=404, detail="Removed user not found" if removed else "User not found")
    return row


async def _other_active_admins(user_id: str) -> int:
    row = await db.query_one(
        """SELECT COUNT(*)::int AS n FROM users
            WHERE role = 'admin' AND is_active AND deleted_at IS NULL AND id::text <> $1""",
        [user_id],
    )
    return row["n"] if row else 0


def _modules_and_level(body: dict) -> tuple[list[str], str]:
    slugs = body.get("modules", [])
    level = body.get("access_level", "standard")
    if not isinstance(slugs, list) or not all(isinstance(s, str) for s in slugs):
        raise HTTPException(status_code=400, detail="modules must be a list of module slugs")
    if level not in ACCESS_LEVELS:
        raise HTTPException(status_code=400, detail=f"access_level must be one of {', '.join(ACCESS_LEVELS)}")
    return sorted(set(slugs)), level


async def _check_known_modules(slugs: list[str]) -> None:
    known = {r["slug"] for r in await db.query_many("SELECT slug FROM modules")}
    unknown = sorted(set(slugs) - known)
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown modules: {', '.join(unknown)}")


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
                WHERE u.deleted_at IS NULL
                GROUP BY u.id
                ORDER BY u.created_at ASC
                LIMIT $1 OFFSET $2""",
            [limit, offset],
        )
        total = await db.query_one("SELECT COUNT(*)::int AS count FROM users WHERE deleted_at IS NULL")
        return {"data": users, "pagination": {"limit": limit, "offset": offset, "total": total["count"] if total else 0}}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Users list error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch users")


@router.get("/users/removed")
async def list_removed_users():
    """Removed users, most recently removed first, for the Admin page's restore list."""
    try:
        users = await db.query_many(
            """SELECT id, email, name, role, deleted_at FROM users
                WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500"""
        )
        return {"data": users}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Removed users list error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch removed users")


@router.post("/users", status_code=201)
async def create_user(request: Request, body: dict = Body(...), admin: AuthUser = Depends(require_roles("admin"))):
    """Adds a user with a password the admin chose (the user can change it in Settings), a role,
    and access to `modules` at `access_level`."""
    email = str(body.get("email") or "").strip().lower()
    name = str(body.get("name") or "").strip()
    password = body.get("password")
    role = body.get("role", "marketing")

    if not _EMAIL.match(email) or len(email) > 255:
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    if not name or len(name) > 255:
        raise HTTPException(status_code=400, detail="Name must be 1 to 255 characters")
    # Same rule as changing your own password in Settings; bcrypt reads at most 72 bytes.
    if not isinstance(password, str) or len(password) < 10 or len(password.encode()) > 72:
        raise HTTPException(status_code=400, detail="The password needs 10 to 72 characters")
    if role not in ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of {', '.join(ROLES)}")
    slugs, level = _modules_and_level(body)
    await _check_known_modules(slugs)

    existing = await db.query_one("SELECT deleted_at FROM users WHERE LOWER(email) = $1", [email])
    if existing:
        detail = (
            "This email belongs to a removed user. Restore them from Removed users instead."
            if existing["deleted_at"] is not None
            else "A user with this email already exists"
        )
        raise HTTPException(status_code=409, detail=detail)

    user_id = str(uuid.uuid4())
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(10)).decode()
    try:
        pool = db.get_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    """INSERT INTO users (id, email, name, password_hash, role, is_active, created_at, updated_at)
                       VALUES ($1::uuid, $2, $3, $4, $5, TRUE, NOW(), NOW())""",
                    user_id, email, name, password_hash, role,
                )
                if slugs:
                    await conn.execute(
                        """INSERT INTO module_access (user_id, module_id, access_level)
                           SELECT $1::uuid, id, $3 FROM modules WHERE slug = ANY($2::text[])""",
                        user_id, slugs, level,
                    )
    except Exception as error:  # noqa: BLE001
        logger.error(f"User create error: {error}")
        raise HTTPException(status_code=500, detail="Failed to add user")

    await log_activity(
        admin.id, "admin.create_user", resource_type="user", resource_id=user_id,
        details={"email": email, "name": name, "role": role, "modules": len(slugs), "access_level": level},
        request=request,
    )
    return {"user": {"id": user_id, "email": email, "name": name, "role": role, "is_active": True}}


@router.delete("/users/{user_id}")
async def remove_user(user_id: str, request: Request, admin: AuthUser = Depends(require_roles("admin"))):
    """Soft-deletes the user: they can't sign in and leave the user list; nothing is erased."""
    target = await _user_row(user_id)
    if str(target["id"]) == admin.id:
        raise HTTPException(status_code=400, detail="You can't remove yourself")
    if target["role"] == "admin" and target["is_active"] and await _other_active_admins(user_id) == 0:
        raise HTTPException(status_code=400, detail="At least one active admin must remain")
    try:
        await db.execute(
            "UPDATE users SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW() WHERE id::text = $1",
            [user_id],
        )
    except Exception as error:  # noqa: BLE001
        logger.error(f"User remove error: {error}")
        raise HTTPException(status_code=500, detail="Failed to remove user")

    forget_account(user_id)
    await log_activity(
        admin.id, "admin.remove_user", resource_type="user", resource_id=user_id,
        details={"email": target["email"], "name": target["name"], "was_active": target["is_active"]},
        request=request,
    )
    return {"removed": True}


@router.post("/users/{user_id}/restore")
async def restore_user(user_id: str, request: Request, admin: AuthUser = Depends(require_roles("admin"))):
    """Brings a removed user back, active, with the role and module access they had."""
    target = await _user_row(user_id, removed=True)
    try:
        after = await db.query_one(
            """UPDATE users SET deleted_at = NULL, is_active = TRUE, updated_at = NOW() WHERE id::text = $1
               RETURNING id, email, name, role, is_active""",
            [user_id],
        )
    except Exception as error:  # noqa: BLE001
        logger.error(f"User restore error: {error}")
        raise HTTPException(status_code=500, detail="Failed to restore user")

    forget_account(user_id)
    await log_activity(
        admin.id, "admin.restore_user", resource_type="user", resource_id=user_id,
        details={"email": target["email"], "name": target["name"]},
        request=request,
    )
    return {"user": after}


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

    await _check_known_modules(slugs)

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
            "SELECT (SELECT COUNT(*)::int FROM users WHERE is_active AND deleted_at IS NULL) AS active_accounts, (SELECT COUNT(*)::int FROM modules) AS modules_total"
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
