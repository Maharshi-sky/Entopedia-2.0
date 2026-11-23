"""Socket.IO server mirroring the original websocket/socket.ts (not mounted by main.py, same as the TS original)."""
import asyncio
import os

import jwt
import socketio

from app.middleware.auth import jwt_secret
from app.services.notification_service import notification_service
from app.services.queue_service import queue_service
from app.utils.logger import logger

sio = socketio.AsyncServer(
    cors_allowed_origins=os.getenv("CORS_ORIGIN") or "http://localhost:3001",
    async_mode="asgi",
)

_search_timers: dict[str, asyncio.TimerHandle] = {}


@sio.event
async def connect(sid, environ, auth):
    token = (auth or {}).get("token")
    if not token:
        raise ConnectionRefusedError("Authentication error")
    try:
        decoded = jwt.decode(token, jwt_secret(), algorithms=["HS256"])
    except Exception:  # noqa: BLE001
        raise ConnectionRefusedError("Invalid token")

    async with sio.session(sid) as session:
        session["user"] = decoded
    await sio.enter_room(sid, f"user:{decoded['id']}")
    logger.info(f"User connected: {decoded['id']}")


@sio.event
async def disconnect(sid):
    async with sio.session(sid) as session:
        user = session.get("user") or {}
    logger.info(f"User disconnected: {user.get('id')}")


@sio.on("subscribe-notifications")
async def subscribe_notifications(sid):
    async with sio.session(sid) as session:
        user_id = session["user"]["id"]
    logger.debug(f"User subscribed to notifications: {user_id}")
    try:
        notifications = await notification_service.get_user_notifications(user_id, 20, 0)
        await sio.emit("notifications-list", notifications, to=sid)
    except Exception as error:  # noqa: BLE001
        logger.error(f"Failed to fetch notifications: {error}")


@sio.on("submit-ai-query")
async def submit_ai_query(sid, data):
    async with sio.session(sid) as session:
        user_id = session["user"]["id"]
    try:
        job_id = await queue_service.queue_ai_query(user_id, data["question"], data["modules"])
        await sio.emit("query-queued", {"jobId": job_id}, to=sid)

        async def poll() -> None:
            while True:
                await asyncio.sleep(0.5)
                status = await queue_service.get_job_status(job_id, "ai-queries")
                if not status:
                    return
                await sio.emit("query-progress", {"jobId": job_id, "state": status["state"], "progress": status["progress"]}, to=sid)
                if status["state"] == "completed":
                    await sio.emit("query-completed", {"jobId": job_id, "result": status["result"]}, to=sid)
                    return
                if status["state"] == "failed":
                    await sio.emit("query-failed", {"jobId": job_id, "error": status["error"]}, to=sid)
                    return

        asyncio.create_task(poll())
    except Exception as error:  # noqa: BLE001
        logger.error(f"Query submission error: {error}")
        await sio.emit("query-error", {"error": "Failed to submit query"}, to=sid)


@sio.on("generate-report")
async def generate_report(sid, data):
    async with sio.session(sid) as session:
        user_id = session["user"]["id"]
    try:
        job_id = await queue_service.queue_report_generation(user_id, data["templateType"], data["parameters"])
        await sio.emit("report-queued", {"jobId": job_id}, to=sid)

        async def poll() -> None:
            while True:
                await asyncio.sleep(0.5)
                status = await queue_service.get_job_status(job_id, "reports")
                if not status:
                    return
                await sio.emit("report-progress", {"jobId": job_id, "progress": status["progress"]}, to=sid)
                if status["state"] == "completed":
                    await sio.emit("report-completed", {"jobId": job_id, "reportId": status["result"]}, to=sid)
                    return

        asyncio.create_task(poll())
    except Exception as error:  # noqa: BLE001
        logger.error(f"Report generation error: {error}")
        await sio.emit("report-error", {"error": "Failed to generate report"}, to=sid)


@sio.on("live-search")
async def live_search(sid, data):
    existing = _search_timers.pop(sid, None)
    if existing:
        existing.cancel()

    async def _emit() -> None:
        try:
            await sio.emit("search-results", {"query": data["q"], "results": []}, to=sid)
        except Exception as error:  # noqa: BLE001
            logger.error(f"Search error: {error}")
            await sio.emit("search-error", {"error": "Search failed"}, to=sid)

    loop = asyncio.get_event_loop()
    _search_timers[sid] = loop.call_later(0.3, lambda: asyncio.create_task(_emit()))


@sio.on("subscribe")
async def subscribe(sid, channel):
    await sio.enter_room(sid, f"channel:{channel}")
    logger.debug(f"User subscribed to channel: {channel}")


@sio.on("unsubscribe")
async def unsubscribe(sid, channel):
    await sio.leave_room(sid, f"channel:{channel}")
    logger.debug(f"User unsubscribed from channel: {channel}")


async def emit_to_user(user_id: str, event: str, data) -> None:
    await sio.emit(event, data, room=f"user:{user_id}")


async def emit_to_channel(channel: str, event: str, data) -> None:
    await sio.emit(event, data, room=f"channel:{channel}")


async def broadcast(event: str, data) -> None:
    await sio.emit(event, data)
