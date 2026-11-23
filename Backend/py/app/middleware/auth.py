"""
One place for the signing secret. There is deliberately no fallback value:
a missing JWT_SECRET would otherwise let anyone mint tokens signed with a
well-known default. main.py refuses to start without it.
"""
import os
import time
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.db.connection import db
from app.utils.logger import logger


def jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET is not set")
    return secret


def jwt_expiry_seconds() -> int:
    """JWT_EXPIRY as seconds; accepts forms like '7d', '12h', '3600' (default 7 days)."""
    raw = (os.getenv("JWT_EXPIRY") or "7d").strip()
    units = {"s": 1, "m": 60, "h": 3600, "d": 86400}
    if raw[-1].lower() in units and raw[:-1].isdigit():
        return int(raw[:-1]) * units[raw[-1].lower()]
    if raw.isdigit():
        return int(raw)
    return 7 * 86400


class AuthUser(BaseModel):
    id: str
    email: str
    role: str


_ACCOUNT_TTL_S = 30
_accounts: dict[str, tuple[float, Optional[dict]]] = {}


async def _account(user_id: str) -> Optional[dict]:
    """The user's current role, active flag and module access ({slug: level}), cached briefly
    (the database is remote)."""
    now = time.monotonic()
    hit = _accounts.get(user_id)
    if hit and now - hit[0] < _ACCOUNT_TTL_S:
        return hit[1]
    row = await db.query_one(
        """SELECT u.role, u.is_active,
                  COALESCE(jsonb_object_agg(m.slug, ma.access_level) FILTER (WHERE m.slug IS NOT NULL), '{}'::jsonb) AS modules
             FROM users u
             LEFT JOIN module_access ma ON ma.user_id = u.id AND ma.access_level <> 'none'
             LEFT JOIN modules m ON m.id = ma.module_id
            WHERE u.id::text = $1
            GROUP BY u.id""",
        [user_id],
    )
    _accounts[user_id] = (now, row)
    return row


def forget_account(user_id: str) -> None:
    """Call after changing a user's role, active flag or module access, so it applies on their next request."""
    _accounts.pop(str(user_id), None)


_MODULES_TTL_S = 300
_modules: tuple[float, list[str]] | None = None


async def _all_module_slugs() -> list[str]:
    """Every module's slug. The list changes only with a migration, so it is kept for a few minutes
    (each database round trip costs about half a second from here)."""
    global _modules
    now = time.monotonic()
    if _modules and now - _modules[0] < _MODULES_TTL_S:
        return _modules[1]
    slugs = [r["slug"] for r in await db.query_many("SELECT slug FROM modules")]
    _modules = (now, slugs)
    return slugs


async def module_access(user: "AuthUser") -> dict[str, str]:
    """{module slug: access level} the user may open. Admins may open every module, fully.
    Answered from memory while the user's account (30 s) and the module list (5 min) are cached."""
    if user.role == "admin":
        return {slug: "full" for slug in await _all_module_slugs()}
    account = await _account(user.id)
    return dict(account["modules"]) if account else {}


def require_module(*slugs: str):
    """
    The user needs access to at least one of `slugs` (several modules can share an API, e.g. the patent
    list serves Competitor Intelligence and the Patent Sheet Analyser). With only read access, the user
    may read (GET) but not create, change or generate (any other method). Admins always pass.
    """

    async def _dependency(request: Request, user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if user.role == "admin":
            return user
        access = await module_access(user)
        levels = [access[s] for s in slugs if s in access]
        if not levels:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You don't have access to this module")
        if request.method not in ("GET", "HEAD") and all(level == "read" for level in levels):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your access to this module is read-only")
        return user

    return _dependency


async def get_current_user(request: Request) -> AuthUser:
    header = request.headers.get("authorization")
    token = header.split(" ")[1] if header and " " in header else None

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No token provided")

    try:
        decoded = jwt.decode(token, jwt_secret(), algorithms=["HS256"])
    except Exception as error:  # noqa: BLE001
        logger.error(f"Token verification failed: {error}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    # A token stays valid for days, so a deactivated account or a changed role is checked here,
    # not only at sign-in.
    account = await _account(str(decoded["id"]))
    if not account or account["is_active"] is False:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is disabled or removed")
    return AuthUser(id=str(decoded["id"]), email=decoded["email"], role=account["role"])


async def get_current_user_optional(request: Request) -> Optional[AuthUser]:
    header = request.headers.get("authorization")
    token = header.split(" ")[1] if header and " " in header else None
    if not token:
        return None
    try:
        decoded = jwt.decode(token, jwt_secret(), algorithms=["HS256"])
        return AuthUser(id=decoded["id"], email=decoded["email"], role=decoded["role"])
    except Exception:  # noqa: BLE001
        return None


def require_roles(*allowed_roles: str):
    def _dependency(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if user.role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return _dependency
