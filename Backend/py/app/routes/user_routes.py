import json
import uuid

import bcrypt
from fastapi import APIRouter, Body, Depends, HTTPException, Request

from app.db.connection import db
from app.middleware.auth import AuthUser, get_current_user, module_access
from app.routes.auth_routes import _password_matches
from app.services.activity import log_activity, log_visit
from app.utils.logger import logger

router = APIRouter(dependencies=[Depends(get_current_user)])


NOTIFICATION_DEFAULTS = {"email": True, "push": True, "digest": True, "regulatory": True}


@router.get("/profile")
async def get_profile(user: AuthUser = Depends(get_current_user)):
    """The signed-in user's own account, for Settings and the sidebar."""
    try:
        row = await db.query_one(
            """SELECT u.id, u.email, u.name, u.role, u.is_active, u.created_at, u.last_login_at,
                      p.preferences AS notifications
                 FROM users u LEFT JOIN notification_preferences p ON p.user_id = u.id
                WHERE u.id::text = $1""",
            [user.id],
        )
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        saved = row.pop("notifications") or {}
        access = await module_access(user)
        return {
            **row,
            "notifications": {k: bool(saved.get(k, v)) for k, v in NOTIFICATION_DEFAULTS.items()},
            "modules": access,
        }
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(f"Profile fetch error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch profile")


@router.get("/modules")
async def my_modules(user: AuthUser = Depends(get_current_user)):
    """The modules the user may open, {slug: access level}; the frontend locks the rest."""
    return {"role": user.role, "modules": await module_access(user)}


@router.post("/visit")
async def record_visit(body: dict = Body(...), user: AuthUser = Depends(get_current_user)):
    """The frontend reports each module page the user opens (by module slug), for the Admin page."""
    slug = body.get("module")
    if not isinstance(slug, str) or not slug or len(slug) > 100:
        raise HTTPException(status_code=400, detail="module (a module slug) is required")
    return {"recorded": await log_visit(user.id, slug)}


@router.put("/profile")
async def update_profile(request: Request, body: dict = Body(...), user: AuthUser = Depends(get_current_user)):
    """Users change their own display name. Email and role are set by an admin."""
    name = str(body.get("name") or "").strip()
    if not name or len(name) > 255:
        raise HTTPException(status_code=400, detail="Name must be 1 to 255 characters")
    try:
        before = await db.query_one("SELECT name FROM users WHERE id::text = $1", [user.id])
        await db.execute("UPDATE users SET name = $1, updated_at = NOW() WHERE id::text = $2", [name, user.id])
    except Exception as error:  # noqa: BLE001
        logger.error(f"Profile update error: {error}")
        raise HTTPException(status_code=500, detail="Failed to update profile")
    if before and before["name"] != name:
        await log_activity(user.id, "profile.update", details={"before": {"name": before["name"]}, "after": {"name": name}}, request=request)
    return {"name": name}


@router.post("/password")
async def change_password(request: Request, body: dict = Body(...), user: AuthUser = Depends(get_current_user)):
    current = body.get("current_password")
    new = body.get("new_password")
    if not isinstance(current, str) or not isinstance(new, str):
        raise HTTPException(status_code=400, detail="Current and new password are required")
    if len(new) < 10 or len(new.encode()) > 72:
        raise HTTPException(status_code=400, detail="The new password needs 10 to 72 characters")
    if new == current:
        raise HTTPException(status_code=400, detail="The new password must differ from the current one")

    row = await db.query_one("SELECT password_hash FROM users WHERE id::text = $1", [user.id])
    if not row or not _password_matches(current, row["password_hash"]):
        await log_activity(user.id, "password_change_failed", details={"reason": "wrong current password"}, request=request)
        raise HTTPException(status_code=400, detail="The current password is wrong")

    password_hash = bcrypt.hashpw(new.encode(), bcrypt.gensalt(10)).decode()
    await db.execute("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id::text = $2", [password_hash, user.id])
    await log_activity(user.id, "password_changed", request=request)
    return {"message": "Password changed"}


@router.post("/notification-preferences")
async def update_notification_preferences(body: dict = Body(...), user: AuthUser = Depends(get_current_user)):
    raw = body.get("preferences")
    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail="preferences must be an object")
    preferences = {k: bool(raw[k]) if k in raw else v for k, v in NOTIFICATION_DEFAULTS.items()}
    try:
        await db.execute(
            """INSERT INTO notification_preferences (user_id, preferences, updated_at) VALUES ($1, $2, NOW())
               ON CONFLICT (user_id) DO UPDATE SET preferences = $2, updated_at = NOW()""",
            [user.id, json.dumps(preferences)],
        )
        return {"preferences": preferences}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Preferences update error: {error}")
        raise HTTPException(status_code=500, detail="Failed to update preferences")


@router.get("/saved-searches")
async def saved_searches(user: AuthUser = Depends(get_current_user)):
    try:
        searches = await db.query_many(
            "SELECT id, name, query, modules, created_at FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC", [user.id]
        )
        return {"searches": searches}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Saved searches fetch error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch saved searches")


@router.post("/saved-searches")
async def create_saved_search(body: dict = Body(...), user: AuthUser = Depends(get_current_user)):
    try:
        name = body.get("name")
        query = body.get("query")
        modules = body.get("modules")

        search_id = str(uuid.uuid4())
        await db.execute(
            "INSERT INTO saved_searches (id, user_id, name, query, modules, created_at) VALUES ($1, $2, $3, $4, $5, NOW())",
            [search_id, user.id, name, query, modules],
        )
        return {"id": search_id, "message": "Search saved"}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Save search error: {error}")
        raise HTTPException(status_code=500, detail="Failed to save search")


@router.delete("/saved-searches/{search_id}")
async def delete_saved_search(search_id: str, user: AuthUser = Depends(get_current_user)):
    try:
        await db.execute("DELETE FROM saved_searches WHERE id = $1 AND user_id = $2", [search_id, user.id])
        return {"message": "Search deleted"}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Delete search error: {error}")
        raise HTTPException(status_code=500, detail="Failed to delete search")


@router.get("/alerts")
async def user_alerts(user: AuthUser = Depends(get_current_user)):
    try:
        alerts = await db.query_many(
            "SELECT id, title, message, severity, read, created_at FROM alerts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
            [user.id],
        )
        return {"alerts": alerts}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Alerts fetch error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch alerts")
