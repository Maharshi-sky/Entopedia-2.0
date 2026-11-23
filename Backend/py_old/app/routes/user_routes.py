import json
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException

from app.db.connection import db
from app.middleware.auth import AuthUser, get_current_user
from app.utils.logger import logger

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/profile")
async def get_profile(user: AuthUser = Depends(get_current_user)):
    try:
        row = await db.query_one("SELECT id, email, name, role, created_at FROM users WHERE id = $1", [user.id])
        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        access = await db.query_many("SELECT module_id, access_level FROM module_access WHERE user_id = $1", [user.id])
        return {**row, "module_access": access}
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(f"Profile fetch error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch profile")


@router.put("/profile")
async def update_profile(body: dict = Body(...), user: AuthUser = Depends(get_current_user)):
    try:
        name = body.get("name")
        await db.execute("UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2", [name, user.id])
        return {"message": "Profile updated"}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Profile update error: {error}")
        raise HTTPException(status_code=500, detail="Failed to update profile")


@router.post("/notification-preferences")
async def update_notification_preferences(body: dict = Body(...), user: AuthUser = Depends(get_current_user)):
    try:
        preferences = body.get("preferences")
        await db.execute(
            "INSERT INTO notification_preferences (user_id, preferences) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET preferences = $2",
            [user.id, json.dumps(preferences)],
        )
        return {"message": "Preferences updated"}
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
