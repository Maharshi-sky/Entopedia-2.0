import re
import uuid

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.db.connection import db
from app.middleware.auth import AuthUser, get_current_user, jwt_expiry_seconds, jwt_secret
from app.services.activity import log_activity
from app.utils.logger import logger

router = APIRouter()


_BCRYPT_HASH = re.compile(r"^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$")


def _password_matches(password: str, password_hash: str | None) -> bool:
    """False (a 401) for a missing or broken stored hash, e.g. a row added by hand, instead of a 500."""
    if not password_hash or not _BCRYPT_HASH.match(password_hash):
        logger.warning("Login: this user's password_hash is empty or not a bcrypt hash; set it with app.migrations.seed")
        return False
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def _sign_token(user_id: str, email: str, role: str) -> str:
    now = __import__("time").time()
    payload = {"id": str(user_id), "email": email, "role": role, "iat": int(now), "exp": int(now) + jwt_expiry_seconds()}
    return jwt.encode(payload, jwt_secret(), algorithm="HS256")


class RegisterBody(BaseModel):
    email: str | None = None
    password: str | None = None
    name: str | None = None


class LoginBody(BaseModel):
    email: str | None = None
    password: str | None = None


class RefreshBody(BaseModel):
    token: str | None = None


@router.post("/register", status_code=201)
async def register(body: RegisterBody):
    if not body.email or not body.password or not body.name:
        raise HTTPException(status_code=400, detail="Missing required fields")

    try:
        existing = await db.query_one("SELECT id FROM users WHERE email = $1", [body.email])
        if existing:
            raise HTTPException(status_code=409, detail="User already exists")

        password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt(10)).decode()
        user_id = str(uuid.uuid4())

        await db.execute(
            "INSERT INTO users (id, email, name, password_hash, role, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())",
            [user_id, body.email, body.name, password_hash, "marketing", True],
        )

        token = _sign_token(user_id, body.email, "marketing")
        # ── FIXED ── (wapas original: register mein `user` variable nahi hota)
        return {"id": user_id, "email": body.email, "name": body.name, "token": token}
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(f"Registration error: {error}")
        raise HTTPException(status_code=500, detail="Registration failed")


@router.post("/login")
async def login(body: LoginBody, request: Request):
    if not body.email or not body.password:
        raise HTTPException(status_code=400, detail="Missing email or password")

    try:
        user = await db.query_one(
            "SELECT id, email, name, password_hash, role, is_active FROM users WHERE email = $1", [body.email]
        )

        if not user or not _password_matches(body.password, user["password_hash"]):
            # Unknown emails are logged without a user (the email is in details).
            await log_activity(
                user["id"] if user else None, "login_failed",
                details={"email": body.email[:255], "reason": "wrong password" if user else "unknown email"},
                request=request,
            )
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if user["is_active"] is False:
            await log_activity(user["id"], "login_failed", details={"email": user["email"], "reason": "account disabled"}, request=request)
            raise HTTPException(status_code=403, detail="Account is disabled")

        token = _sign_token(user["id"], user["email"], user["role"])
        await db.execute("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user["id"]])
        await log_activity(user["id"], "login", request=request)
        return {"id": str(user["id"]), "email": user["email"], "name": user["name"], "role": user["role"], "token": token}
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(f"Login error: {error}")
        raise HTTPException(status_code=500, detail="Login failed")


@router.post("/logout", status_code=204)
async def logout(request: Request, user: AuthUser = Depends(get_current_user)):
    """Tokens are stateless, so this only records the sign-out; the frontend drops its cookie."""
    await log_activity(user.id, "logout", request=request)


@router.post("/refresh")
async def refresh_token(body: RefreshBody):
    try:
        decoded = jwt.decode(body.token, jwt_secret(), algorithms=["HS256"])
        return {"token": _sign_token(decoded["id"], decoded["email"], decoded["role"])}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Token refresh error: {error}")
        raise HTTPException(status_code=401, detail="Invalid token")