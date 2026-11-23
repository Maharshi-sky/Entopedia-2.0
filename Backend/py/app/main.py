"""File: Entopedia 2.0 Backend (Python port) / app/main.py"""
import os
import sys
from contextlib import asynccontextmanager
from datetime import datetime, UTC

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

load_dotenv()

from app.db.connection import db  # noqa: E402
from app.db.redis_client import redis  # noqa: E402
from app.middleware.auth import require_module  # noqa: E402
from app.news.scheduler import start_news_jobs  # noqa: E402
from app.routes import (  # noqa: E402
    admin_routes, ai_routes, audit_routes, auth_routes, claim_routes, competitor_routes,
    dashboard_routes, knowledge_routes, news_routes, papers_routes, patent_routes, pest_vision_routes,
    regulatory_routes, user_routes,
)
from app.utils.logger import logger  # noqa: E402

# SEC-01: Strict CORS Origin Allow-list
_configured_origins = [o.strip() for o in (os.getenv("CORS_ORIGIN") or "").split(",") if o.strip()]
ALLOWED_ORIGINS = [*_configured_origins, "http://localhost:3000", "http://localhost:3001"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.getenv("JWT_SECRET"):
        logger.error("JWT_SECRET is not configured. Terminating process.")
        sys.exit(1)

    try:
        await db.connect()
        logger.info("Database connected successfully")

        try:
            await redis.connect()
        except Exception as error:  # noqa: BLE001
            logger.warning(f"Redis cache unavailable, running in direct mode: {error}")

        port = os.getenv("PORT", "4000")
        logger.info(f"Entopedia 2.0 API engine running on port {port}")

        try:
            await start_news_jobs()
        except Exception as error:  # noqa: BLE001
            logger.error(f"News jobs could not start: {error}")

        yield
    finally:
        await db.close()


app = FastAPI(lifespan=lifespan, redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail
    if isinstance(detail, dict):
        body = detail
    else:
        body = {"error": detail}
    # jsonable_encoder: the body can hold database rows (dates), e.g. the running refresh in a 409.
    return JSONResponse(status_code=exc.status_code, content=jsonable_encoder(body), headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(f"Malformed or truncated JSON payload received: {exc}")
    return JSONResponse(
        status_code=400,
        content={"error": "Invalid or truncated JSON payload. Please ensure the request body is valid JSON or upload in smaller batches."},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled request error: {exc}")
    body = {"error": str(exc) or "Internal server error"}
    if os.getenv("NODE_ENV") == "development":
        import traceback
        body["stack"] = traceback.format_exc()
    return JSONResponse(status_code=500, content=body)


@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(UTC).isoformat()}


# Route Registrations
app.include_router(auth_routes.router, prefix="/api/auth")
# Each module's API needs access to that module (module_access; admins always pass). The patent API
# serves several modules, so its routes are guarded one by one in patent_routes.
def _for(*slugs: str) -> list:
    return [Depends(require_module(*slugs))]


app.include_router(dashboard_routes.router, prefix="/api/dashboard", dependencies=_for("dashboard"))

app.include_router(competitor_routes.router, prefix="/api/competitor", dependencies=_for("competitor-intelligence"))
app.include_router(competitor_routes.router, prefix="/api/competitors", dependencies=_for("competitor-intelligence"))

app.include_router(patent_routes.router, prefix="/api/patent")
app.include_router(patent_routes.router, prefix="/api/patents")

app.include_router(regulatory_routes.router, prefix="/api/regulatory", dependencies=_for("regulatory-actives"))
# Stories also appear on the dashboard and in the newsletter.
app.include_router(news_routes.router, prefix="/api/news", dependencies=_for("news", "dashboard", "newsletter"))

app.include_router(claim_routes.router, prefix="/api/claim", dependencies=_for("claim-studio"))
app.include_router(claim_routes.router, prefix="/api/claims", dependencies=_for("claim-studio"))

app.include_router(pest_vision_routes.router, prefix="/api/pest-vision", dependencies=_for("pest-vision"))
app.include_router(papers_routes.router, prefix="/api/papers", dependencies=_for("competitor-intelligence", "knowledge-hub"))
app.include_router(knowledge_routes.router, prefix="/api/knowledge", dependencies=_for("knowledge-hub"))
app.include_router(ai_routes.router, prefix="/api/ai")
app.include_router(admin_routes.router, prefix="/api/admin")
app.include_router(audit_routes.router, prefix="/api/audit")

app.include_router(user_routes.router, prefix="/api/user")
app.include_router(user_routes.router, prefix="/api/users")


# 404 Handler for unmatched routes
@app.middleware("http")
async def not_found_handler(request: Request, call_next):
    response = await call_next(request)
    if response.status_code == 404:
        return JSONResponse(status_code=404, content={"error": "Endpoint not found"})
    return response
