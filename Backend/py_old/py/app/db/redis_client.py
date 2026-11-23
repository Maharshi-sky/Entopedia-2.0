"""
No HTTP route depends on Redis yet (it backs the cache/queue services, which
are not wired in). main.py therefore treats a failed connection as a warning
instead of stopping the server.
"""
import os
from typing import Optional

import redis.asyncio as aioredis

from app.utils.logger import logger

_client: Optional[aioredis.Redis] = None


class RedisWrapper:
    async def connect(self) -> None:
        global _client
        client = aioredis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", "6379")),
            password=os.getenv("REDIS_PASSWORD") or None,
            retry_on_timeout=False,
            socket_connect_timeout=5,
        )
        await client.ping()
        _client = client
        logger.info("Redis connected")

    def is_ready(self) -> bool:
        return _client is not None

    async def get(self, key: str) -> Optional[str]:
        return await self._require().get(key)

    async def set(self, key: str, value: str, ttl: Optional[int] = None) -> None:
        if ttl:
            await self._require().setex(key, ttl, value)
        else:
            await self._require().set(key, value)

    async def delete(self, key: str) -> None:
        await self._require().delete(key)

    async def exists(self, key: str) -> int:
        return await self._require().exists(key)

    async def incr(self, key: str) -> int:
        return await self._require().incr(key)

    def get_client(self) -> aioredis.Redis:
        return self._require()

    def _require(self) -> aioredis.Redis:
        if _client is None:
            raise RuntimeError("Redis is not connected")
        return _client


redis = RedisWrapper()
