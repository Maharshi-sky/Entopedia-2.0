import base64
import json
from typing import Any, Awaitable, Callable, Optional

from app.db.redis_client import redis
from app.utils.logger import logger

DEFAULT_TTL = 3600


class CacheService:
    async def get(self, key: str) -> Optional[Any]:
        try:
            data = await redis.get(key)
            if data:
                logger.debug(f"Cache hit: {key}")
                return json.loads(data)
            return None
        except Exception as error:  # noqa: BLE001
            logger.error(f"Cache get error for {key}: {error}")
            return None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        try:
            await redis.set(key, json.dumps(value), ttl or DEFAULT_TTL)
            logger.debug(f"Cache set: {key}")
        except Exception as error:  # noqa: BLE001
            logger.error(f"Cache set error for {key}: {error}")

    async def delete(self, key: str) -> None:
        try:
            await redis.delete(key)
            logger.debug(f"Cache deleted: {key}")
        except Exception as error:  # noqa: BLE001
            logger.error(f"Cache delete error for {key}: {error}")

    async def invalidate_pattern(self, pattern: str) -> None:
        try:
            client = redis.get_client()
            keys = [k async for k in client.scan_iter(match=pattern)]
            if keys:
                await client.delete(*keys)
                logger.debug(f"Invalidated {len(keys)} cache keys matching {pattern}")
        except Exception as error:  # noqa: BLE001
            logger.error(f"Cache invalidation error for pattern {pattern}: {error}")

    def get_patent_key(self, patent_id: str) -> str:
        return f"patent:{patent_id}"

    def get_competitor_key(self, competitor_id: str) -> str:
        return f"competitor:{competitor_id}"

    def get_news_key(self, news_id: str) -> str:
        return f"news:{news_id}"

    def get_dashboard_key(self, user_id: str, time_range: str) -> str:
        return f"dashboard:{user_id}:{time_range}"

    def get_search_key(self, query: str, filters: str) -> str:
        return f"search:{base64.b64encode(f'{query}:{filters}'.encode()).decode()}"

    def get_ai_query_key(self, question: str, modules: list[str]) -> str:
        joined = ",".join(modules)
        return f"ai:{base64.b64encode(f'{question}:{joined}'.encode()).decode()}"

    async def invalidate_competitor(self, competitor_id: str) -> None:
        await self.delete(self.get_competitor_key(competitor_id))

    async def invalidate_patent(self, patent_id: str) -> None:
        await self.delete(self.get_patent_key(patent_id))

    async def invalidate_dashboard(self, user_id: str) -> None:
        await self.invalidate_pattern(f"dashboard:{user_id}:*")

    async def invalidate_news(self, news_id: str) -> None:
        await self.delete(self.get_news_key(news_id))

    async def warm_cache(self, key: str, loader: Callable[[], Awaitable[Any]], ttl: Optional[int] = None) -> Any:
        try:
            cached = await self.get(key)
            if cached:
                return cached
            data = await loader()
            await self.set(key, data, ttl)
            return data
        except Exception as error:  # noqa: BLE001
            logger.error(f"Cache warming error for {key}: {error}")
            raise


cache_service = CacheService()
