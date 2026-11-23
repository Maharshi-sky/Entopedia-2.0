import uuid

import bcrypt
import jwt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.connection import db
from app.middleware.auth import jwt_expiry_seconds, jwt_secret
from app.utils.logger import logger

router = APIRouter()


def _sign_token(user_id: str, email: str, role: str) -> str:
    now = __import__("time").time()
    payload = {"id": user_id, "email": email, "role": role, "iat": int(now), "exp": int(now) + jwt_expiry_seconds()}
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
        return {"id": user_id, "email": body.email, "name": body.name, "token": token}
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(f"Registration error: {error}")
        raise HTTPException(status_code=500, detail="Registration failed")


@router.post("/login")
async def login(body: LoginBody):
    if not body.email or not body.password:
        raise HTTPException(status_code=400, detail="Missing email or password")

    try:
        user = await db.query_one(
            "SELECT id, email, name, password_hash, role, is_active FROM users WHERE email = $1", [body.email]
        )

        if not user or not bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if user["is_active"] is False:
            raise HTTPException(status_code=403, detail="Account is disabled")

        token = _sign_token(user["id"], user["email"], user["role"])
        return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"], "token": token}
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(f"Login error: {error}")
        raise HTTPException(status_code=500, detail="Login failed")


@router.post("/refresh")
async def refresh_token(body: RefreshBody):
    try:
        decoded = jwt.decode(body.token, jwt_secret(), algorithms=["HS256"])
        return {"token": _sign_token(decoded["id"], decoded["email"], decoded["role"])}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Token refresh error: {error}")
        raise HTTPException(status_code=401, detail="Invalid token")
