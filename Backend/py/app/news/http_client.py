"""
HTTP helpers for the news scraper: a browser-like GET with a timeout and an
optional size limit, and Zyte API for sites that refuse direct requests.
"""
import asyncio
import base64
import os
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional, TypeVar

import httpx

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)


class HttpError(Exception):
    """A response with a non-2xx status."""

    def __init__(self, status: int, url: str):
        super().__init__(f"HTTP {status}")
        self.status = status
        self.url = url


@dataclass
class Page:
    text: str
    url: str


async def _read_body(response: httpx.Response, limit_bytes: Optional[int]) -> bytes:
    if not limit_bytes:
        return response.content
    chunks: list[bytes] = []
    size = 0
    async for chunk in response.aiter_bytes():
        chunks.append(chunk)
        size += len(chunk)
        if size >= limit_bytes:
            break
    data = b"".join(chunks)
    return data[:limit_bytes]


async def http_get(
    url: str,
    timeout_ms: int = 40_000,
    limit_bytes: Optional[int] = None,
    method: str = "GET",
    body: Optional[str] = None,
    headers: Optional[dict[str, str]] = None,
) -> Page:
    req_headers = {"User-Agent": USER_AGENT, "Accept-Language": "en", **(headers or {})}
    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout_ms / 1000) as client:
        if limit_bytes:
            async with client.stream(method, url, headers=req_headers, content=body) as response:
                if response.status_code >= 400:
                    raise HttpError(response.status_code, url)
                data = await _read_body(response, limit_bytes)
                final_url = str(response.url)
                charset = _charset_of(response.headers.get("content-type"))
        else:
            response = await client.request(method, url, headers=req_headers, content=body)
            if response.status_code >= 400:
                raise HttpError(response.status_code, url)
            data = response.content
            final_url = str(response.url)
            charset = _charset_of(response.headers.get("content-type"))

    text = _decode(data, charset)
    return Page(text=text, url=final_url or url)


def _charset_of(content_type: Optional[str]) -> str:
    if not content_type:
        return "utf-8"
    for part in content_type.split(";"):
        part = part.strip()
        if part.lower().startswith("charset="):
            return part.split("=", 1)[1].strip().strip("'\"")
    return "utf-8"


def _decode(data: bytes, charset: str) -> str:
    try:
        return data.decode(charset)
    except (LookupError, UnicodeDecodeError):
        return data.decode("utf-8", errors="replace")


def zyte_configured() -> bool:
    return bool(os.getenv("ZYTE_API_KEY"))


async def zyte_get(url: str, timeout_ms: int = 90_000) -> Page:
    key = os.getenv("ZYTE_API_KEY")
    if not key:
        raise RuntimeError("ZYTE_API_KEY not set")
    auth = base64.b64encode(f"{key}:".encode()).decode()
    async with httpx.AsyncClient(timeout=timeout_ms / 1000) as client:
        response = await client.post(
            "https://api.zyte.com/v1/extract",
            headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
            json={"url": url, "httpResponseBody": True},
        )
    if response.status_code >= 400:
        raise HttpError(response.status_code, "https://api.zyte.com/v1/extract")
    data = response.json()
    body = data.get("httpResponseBody")
    if not body:
        raise RuntimeError("Zyte returned no page body")
    return Page(text=base64.b64decode(body).decode("utf-8", errors="replace"), url=url)


def is_temporary(error: BaseException) -> bool:
    """Network trouble that may pass: timeouts, dropped connections, rate limits, 5xx."""
    if isinstance(error, HttpError):
        return error.status == 429 or error.status >= 500
    return isinstance(error, (httpx.TimeoutException, httpx.TransportError, httpx.ConnectError))


async def fetch_with_fallback(url: str) -> tuple[Page, str]:
    """Direct first; through Zyte when the direct request fails and a Zyte key is set."""
    try:
        return await http_get(url), "direct"
    except Exception as error:  # noqa: BLE001
        network_or_http = isinstance(error, HttpError) or is_temporary(error)
        if not network_or_http or not zyte_configured():
            raise
        return await zyte_get(url), "zyte"


async def sleep(ms: int) -> None:
    await asyncio.sleep(ms / 1000)


T = TypeVar("T")
R = TypeVar("R")


async def map_limit(items: list[T], workers: int, fn: Callable[[T], Awaitable[R]]) -> list[R]:
    """Runs fn over items with at most `workers` running at once; results keep the input order."""
    results: list[Any] = [None] * len(items)
    sem = asyncio.Semaphore(max(1, min(workers, len(items) or 1)))

    async def run(i: int, item: T) -> None:
        async with sem:
            results[i] = await fn(item)

    await asyncio.gather(*(run(i, item) for i, item in enumerate(items)))
    return results
