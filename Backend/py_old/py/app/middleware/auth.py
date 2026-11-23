"""
One place for the signing secret. There is deliberately no fallback value:
a missing JWT_SECRET would otherwise let anyone mint tokens signed with a
well-known default. main.py refuses to start without it.
"""
import os
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from pydantic import BaseModel

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


async def get_current_user(request: Request) -> AuthUser:
    header = request.headers.get("authorization")
    token = header.split(" ")[1] if header and " " in header else None

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No token provided")

    try:
        decoded = jwt.decode(token, jwt_secret(), algorithms=["HS256"])
        return AuthUser(id=decoded["id"], email=decoded["email"], role=decoded["role"])
    except Exception as error:  # noqa: BLE001
        logger.error(f"Token verification failed: {error}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


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
