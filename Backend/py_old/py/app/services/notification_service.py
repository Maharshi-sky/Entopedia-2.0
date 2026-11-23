import json
from dataclasses import dataclass
from typing import Any, Optional

from app.db.connection import db
from app.utils.logger import logger


@dataclass
class Notification:
    id: str
    user_id: str
    type: str
    title: str
    message: str
    severity: str
    source_module: str
    data: dict
    read: bool
    created_at: Any


class NotificationService:
    async def create_notification(
        self, user_id: str, type_: str, title: str, message: str, severity: str,
        source_module: str, data: dict,
    ) -> str:
        try:
            row = await db.query_one(
                """INSERT INTO notifications (user_id, type, title, message, severity, source_module, data, read, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING id""",
                [user_id, type_, title, message, severity, source_module, json.dumps(data), False],
            )
            # Queue notification sending (email, push, etc.) — not wired to a real queue in this port.
            logger.info(f"Notification queued for {user_id}: {message}")
            return str(row["id"])
        except Exception as error:  # noqa: BLE001
            logger.error(f"Notification creation error: {error}")
            raise

    async def get_user_notifications(self, user_id: str, limit: int = 50, offset: int = 0) -> list[dict]:
        try:
            rows = await db.query_many(
                """SELECT id, user_id AS "userId", type, title, message, severity,
                          source_module AS "sourceModule", data, read, created_at AS "createdAt"
                     FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3""",
                [user_id, limit, offset],
            )
            for n in rows:
                if isinstance(n.get("data"), str):
                    n["data"] = json.loads(n["data"])
            return rows
        except Exception as error:  # noqa: BLE001
            logger.error(f"Get notifications error: {error}")
            raise

    async def mark_as_read(self, notification_id: str) -> None:
        try:
            await db.execute("UPDATE notifications SET read = true WHERE id = $1", [notification_id])
        except Exception as error:  # noqa: BLE001
            logger.error(f"Mark as read error: {error}")
            raise

    async def mark_all_as_read(self, user_id: str) -> None:
        try:
            await db.execute("UPDATE notifications SET read = true WHERE user_id = $1", [user_id])
        except Exception as error:  # noqa: BLE001
            logger.error(f"Mark all as read error: {error}")
            raise

    async def notify_patent_filed(self, patent_data: dict, relevant_users: list[str]) -> None:
        for user_id in relevant_users:
            await self.create_notification(
                user_id, "patent_filed", f"New patent filing from {patent_data['filer']}", patent_data["title"],
                "high" if patent_data.get("threatScore", 0) > 0.8 else "medium", "patent",
                {"patentId": patent_data["id"], "threatScore": patent_data.get("threatScore")},
            )

    async def notify_competitor_move(self, competitor_data: dict, relevant_users: list[str]) -> None:
        for user_id in relevant_users:
            await self.create_notification(
                user_id, "competitor_move", f"Competitor activity: {competitor_data['name']}",
                f"{competitor_data.get('recentFilingsCount')} new filings this month",
                "critical" if competitor_data.get("threatScore", 0) > 0.8 else "high", "competitor",
                {"competitorId": competitor_data["id"], "threatScore": competitor_data.get("threatScore")},
            )

    async def notify_regulatory_change(self, regulation_data: dict, relevant_users: list[str]) -> None:
        for user_id in relevant_users:
            await self.create_notification(
                user_id, "regulatory_change", f"Regulatory update: {regulation_data['market']}",
                f"{regulation_data.get('activeIngredient')} status changed to {regulation_data.get('approvalStatus')}",
                "critical" if regulation_data.get("approvalStatus") == "suspended" else "high", "regulatory",
                {
                    "regulationId": regulation_data.get("id"), "market": regulation_data.get("market"),
                    "activeIngredient": regulation_data.get("activeIngredient"),
                    "approvalStatus": regulation_data.get("approvalStatus"),
                },
            )

    async def notify_news_update(self, news_data: dict, relevant_users: list[str]) -> None:
        for user_id in relevant_users:
            await self.create_notification(
                user_id, "news_update", news_data["title"], news_data["source"], "medium", "news",
                {"newsId": news_data["id"], "category": news_data.get("category")},
            )

    async def get_unread_count(self, user_id: str) -> int:
        try:
            result = await db.query_one(
                "SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = false", [user_id]
            )
            return result["count"] if result else 0
        except Exception as error:  # noqa: BLE001
            logger.error(f"Get unread count error: {error}")
            return 0

    async def delete_notification(self, notification_id: str) -> None:
        try:
            await db.execute("DELETE FROM notifications WHERE id = $1", [notification_id])
        except Exception as error:  # noqa: BLE001
            logger.error(f"Delete notification error: {error}")
            raise


notification_service = NotificationService()
