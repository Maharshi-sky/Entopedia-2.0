from app.db.connection import db
from app.utils.logger import logger


class AnalyticsService:
    async def get_analytics(self, period: str = "30 days") -> dict:
        try:
            active_users = await self._get_active_users(period)
            total_queries = await self._get_total_queries(period)
            module_usage = await self._get_module_usage(period)
            ai_stats = await self._get_ai_query_stats(period)
            patent_stats = await self._get_patent_stats()
            news_stats = await self._get_news_stats()

            return {
                "activeUsers": active_users,
                "totalQueries": total_queries,
                "averageQueryTime": 250,
                "topModules": module_usage,
                "aiQueryStats": ai_stats,
                "searchStats": {"totalSearches": 0, "averageResultsPerSearch": 0, "searchCategories": {}},
                "patentStats": patent_stats,
                "newsStats": news_stats,
            }
        except Exception as error:  # noqa: BLE001
            logger.error(f"Analytics error: {error}")
            raise

    async def _get_active_users(self, period: str) -> int:
        result = await db.query_one(
            "SELECT COUNT(DISTINCT user_id) as count FROM ai_queries WHERE created_at > NOW() - $1::text::interval", [period]
        )
        return result["count"] if result else 0

    async def _get_total_queries(self, period: str) -> int:
        result = await db.query_one(
            "SELECT COUNT(*) as count FROM ai_queries WHERE created_at > NOW() - $1::text::interval", [period]
        )
        return result["count"] if result else 0

    async def _get_module_usage(self, period: str) -> list[dict]:
        return await db.query_many(
            """SELECT UNNEST(modules) as module, COUNT(*) as count FROM ai_queries
               WHERE created_at > NOW() - $1::text::interval GROUP BY UNNEST(modules) ORDER BY count DESC LIMIT 10""",
            [period],
        )

    async def _get_ai_query_stats(self, period: str) -> dict:
        results = await db.query_many(
            """SELECT confidence_level, COUNT(*) as count, AVG(tokens_used) as avg_tokens FROM ai_queries
               WHERE created_at > NOW() - $1::text::interval GROUP BY confidence_level""",
            [period],
        )
        stats: dict = {"totalQueries": 0, "averageTokens": 0, "confidenceLevels": {}}
        for row in results:
            stats["totalQueries"] += row["count"]
            stats["averageTokens"] = row["avg_tokens"]
            stats["confidenceLevels"][row["confidence_level"]] = row["count"]
        return stats

    async def _get_patent_stats(self) -> dict:
        total = await db.query_one("SELECT COUNT(*) as count FROM patents")
        this_month = await db.query_one("SELECT COUNT(*) as count FROM patents WHERE filing_date > NOW() - INTERVAL '1 month'")
        threat_scores = await db.query_many(
            "SELECT CAST(ROUND(threat_score) AS INTEGER) as score, COUNT(*) as count FROM patents GROUP BY CAST(ROUND(threat_score) AS INTEGER)"
        )
        distribution = {f"score_{row['score']}": row["count"] for row in threat_scores}
        return {
            "totalIndexed": total["count"] if total else 0,
            "newThisMonth": this_month["count"] if this_month else 0,
            "threatScoreDistribution": distribution,
        }

    async def _get_news_stats(self) -> dict:
        total = await db.query_one("SELECT COUNT(*) as count FROM news")
        by_category = await db.query_many("SELECT category, COUNT(*) as count FROM news GROUP BY category ORDER BY count DESC")
        by_source = await db.query_many("SELECT source, COUNT(*) as count FROM news GROUP BY source ORDER BY count DESC LIMIT 10")
        category_breakdown = {row["category"]: row["count"] for row in by_category}
        source_breakdown = {row["source"]: row["count"] for row in by_source}
        return {
            "totalArticles": total["count"] if total else 0,
            "categoriesCount": category_breakdown,
            "sourceBreakdown": source_breakdown,
        }

    async def track_event(self, user_id: str, event_type: str, metadata: dict) -> None:
        try:
            import json
            await db.execute(
                "INSERT INTO analytics_events (user_id, event_type, metadata, created_at) VALUES ($1, $2, $3, NOW())",
                [user_id, event_type, json.dumps(metadata)],
            )
        except Exception as error:  # noqa: BLE001
            logger.error(f"Event tracking error: {error}")

    async def get_user_analytics(self, user_id: str) -> dict:
        try:
            queries = await db.query_one("SELECT COUNT(*) as count FROM ai_queries WHERE user_id = $1", [user_id])
            last_active = await db.query_one("SELECT MAX(created_at) as date FROM ai_queries WHERE user_id = $1", [user_id])
            module_usage = await db.query_many(
                "SELECT UNNEST(modules) as module, COUNT(*) as count FROM ai_queries WHERE user_id = $1 GROUP BY UNNEST(modules)",
                [user_id],
            )
            return {
                "totalQueries": queries["count"] if queries else 0,
                "lastActive": last_active["date"] if last_active else None,
                "moduleUsage": module_usage,
            }
        except Exception as error:  # noqa: BLE001
            logger.error(f"User analytics error: {error}")
            raise


analytics_service = AnalyticsService()
