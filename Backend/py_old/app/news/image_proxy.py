"""
Fetches a story's picture for the browser, from this server.

Many news sites refuse to show their pictures on other websites (hot-link protection, Cross-Origin-
Resource-Policy headers, referrer checks), so the News page asks the API, which fetches the picture with
the article as referrer and returns it.

Picture links come from third-party pages, so the fetch is guarded: http(s) only, public addresses only
(no localhost, private networks or cloud metadata endpoints, checked again after every redirect), raster
image types only (no SVG, which can carry script), at most 5 MB.
"""
import ipaddress
import socket
import time
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

import httpx

from app.news.http_client import HttpError, USER_AGENT

MAX_BYTES = 5 * 1024 * 1024
MAX_REDIRECTS = 3
IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/avif"}

_BLOCKED_V4 = [
    ipaddress.ip_network("0.0.0.0/8"), ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"), ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"), ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.0.0.0/24"), ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("198.18.0.0/15"), ipaddress.ip_network("224.0.0.0/4"),
    ipaddress.ip_network("240.0.0.0/4"),
]
_BLOCKED_V6 = [
    ipaddress.ip_network("::/128"), ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"), ipaddress.ip_network("fe80::/10"),
    ipaddress.ip_network("ff00::/8"),
]


def is_private_address(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return True  # unparsable -> treat as unsafe
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    if isinstance(ip, ipaddress.IPv4Address):
        return any(ip in net for net in _BLOCKED_V4)
    return any(ip in net for net in _BLOCKED_V6)


async def _assert_public(url) -> None:  # url: httpx.URL
    if url.scheme not in ("http", "https"):
        raise RuntimeError("only http(s) pictures")
    host = url.host.strip("[]")
    try:
        ipaddress.ip_address(host)
        addresses = [host]
    except ValueError:
        import asyncio
        loop = asyncio.get_event_loop()
        infos = await loop.getaddrinfo(host, None)  # type: ignore[attr-defined]
        addresses = list({info[4][0] for info in infos})
    if not addresses or any(is_private_address(a) for a in addresses):
        raise RuntimeError("picture host is not a public address")


@dataclass
class FetchedImage:
    bytes_: bytes
    type: str


async def fetch_image(src: str, referer: Optional[str] = None) -> FetchedImage:
    url = httpx.URL(src)
    async with httpx.AsyncClient(follow_redirects=False, timeout=10) as client:
        for _hop in range(MAX_REDIRECTS + 1):
            await _assert_public(url)
            headers = {
                "User-Agent": USER_AGENT,
                "Accept": "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
            }
            if referer:
                headers["Referer"] = referer
            response = await client.get(url, headers=headers)
            location = response.headers.get("location")
            if 300 <= response.status_code < 400 and location:
                url = url.join(location)
                continue
            if response.status_code >= 400:
                raise HttpError(response.status_code, str(url))

            content_type = (response.headers.get("content-type") or "").split(";")[0].strip().lower()
            if content_type not in IMAGE_TYPES:
                raise RuntimeError(f"not a picture ({content_type or 'no content type'})")

            content_length = int(response.headers.get("content-length") or 0)
            if content_length > MAX_BYTES:
                raise RuntimeError("picture larger than 5 MB")

            data = response.content
            if len(data) > MAX_BYTES:
                raise RuntimeError("picture larger than 5 MB")

            return FetchedImage(bytes_=data, type="image/jpeg" if content_type == "image/jpg" else content_type)
    raise RuntimeError("too many redirects")


# A small in-memory cache so a page of 20 cards does not fetch the same pictures for every viewer.
_CACHE_LIMIT_BYTES = 40 * 1024 * 1024
_CACHE_TTL_S = 6 * 60 * 60
_cache: dict[str, tuple[FetchedImage, float]] = {}
_cached_bytes = 0


async def cached_image(src: str, referer: Optional[str] = None) -> FetchedImage:
    global _cached_bytes
    hit = _cache.get(src)
    if hit and time.monotonic() - hit[1] < _CACHE_TTL_S:
        del _cache[src]  # move to the end: most recently used
        _cache[src] = hit
        return hit[0]

    image = await fetch_image(src, referer)
    _cache[src] = (image, time.monotonic())
    _cached_bytes += len(image.bytes_)
    for key in list(_cache.keys()):
        if _cached_bytes <= _CACHE_LIMIT_BYTES:
            break
        entry = _cache.pop(key)
        _cached_bytes -= len(entry[0].bytes_)
    return image
