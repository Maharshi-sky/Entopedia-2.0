"""
Article links and pictures (port of images.py / images.ts).

Google News RSS gives only a news.google.com link per story and no picture. For each story this
  1. turns the Google link into the publisher's own link (the same lookup news.google.com does in a browser)
  2. reads that page's preview image (og:image / twitter:image: what the site shows when the link is shared)
"""
import html
import json
import os
import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urljoin, urlparse

from app.news.http_client import HttpError, Page, http_get, is_temporary, map_limit, zyte_configured, zyte_get

GOOGLE_ID = re.compile(r"news\.google\.com/(?:rss/)?articles/([^?/#]+)")
META_TAG = re.compile(r"<meta\b[^>]*>", re.I)
IMAGE_KEYS = ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]

# Refusals that mean "no bots" rather than "page missing": retried through Zyte when ZYTE_API_KEY is set.
BLOCKED = {401, 403, 429, 520, 521, 522, 523, 524, 525, 526, 530}


def _google_base() -> str:
    return (os.getenv("GOOGLE_NEWS_BASE_URL") or "https://news.google.com").rstrip("/")


async def resolve_google(url: str) -> Optional[str]:
    """The publisher's link behind a news.google.com/rss/articles/... link (None if it cannot be found)."""
    m = GOOGLE_ID.search(url or "")
    if not m:
        return url or None  # already a publisher link
    gid = m.group(1)
    page = await http_get(f"{_google_base()}/rss/articles/{gid}", timeout_ms=20_000)
    sig = re.search(r'data-n-a-sg="([^"]+)"', page.text)
    ts = re.search(r'data-n-a-ts="([^"]+)"', page.text)
    if not sig or not ts:
        return None
    inner = (
        '["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],'
        f'"X","X",1,[1,1,1],1,1,null,0,0,null,0],"{gid}",{ts.group(1)},"{sig.group(1)}"]'
    )
    from urllib.parse import quote
    body = "f.req=" + quote(json.dumps([[["Fbv4je", inner]]]))
    out = await http_get(
        f"{_google_base()}/_/DotsSplashUi/data/batchexecute",
        method="POST", body=body, timeout_ms=20_000,
        headers={"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"},
    )
    try:
        envelope = json.loads("\n\n".join(out.text.split("\n\n")[1:]))
        decoded = json.loads(envelope[0][2])
        return decoded[1] if isinstance(decoded[1], str) else None
    except (json.JSONDecodeError, IndexError, TypeError):
        return None


def usable_image(url: Optional[str]) -> bool:
    """A real picture link: points at a file (not just the site's address) and is not the site's logo,
    which some sites set as the preview for every article."""
    if not url or not re.match(r"^https?://", url, re.I):
        return False
    try:
        path = urlparse(url).path
    except ValueError:
        return False
    filename = path.rstrip("/").split("/")[-1].lower() if path else ""
    return path not in ("", "/") and "logo" not in filename


def find_image(content: str, page_url: str) -> Optional[str]:
    """The preview image named in a page's meta tags, as an absolute URL, or None."""
    found: dict[str, str] = {}
    for tag in META_TAG.findall(content):
        key_m = re.search(r'(?:property|name)\s*=\s*["\']([^"\']+)["\']', tag, re.I)
        val_m = re.search(r'content\s*=\s*["\']([^"\']*)["\']', tag, re.I)
        k = key_m.group(1).lower() if key_m else None
        if k and val_m and val_m.group(1).strip() and k in IMAGE_KEYS and k not in found:
            found[k] = html.unescape(val_m.group(1).strip())
    for k in IMAGE_KEYS:
        v = found.get(k)
        if not v:
            continue
        try:
            img = urljoin(page_url, v)
        except ValueError:
            continue
        if usable_image(img):
            return img
    return None


async def page_image(url: str) -> Optional[str]:
    """The page's preview image, or None. Sites that block bots are retried through Zyte when it is set."""
    try:
        page = await http_get(url, timeout_ms=15_000, limit_bytes=600_000)
    except HttpError as error:
        if error.status not in BLOCKED or not zyte_configured():
            raise
        try:
            page = await zyte_get(url, 60_000)
        except Exception as zyte_error:  # noqa: BLE001
            code = zyte_error.status if isinstance(zyte_error, HttpError) else str(zyte_error)
            raise RuntimeError(f"site refused ({error.status}) and Zyte could not get through ({code})")
    return find_image(page.text, page.url)


@dataclass
class ImageLookup:
    article_url: Optional[str] = None
    image: Optional[str] = None
    image_checked: bool = True
    image_error: Optional[str] = None


async def lookup(url: str) -> ImageLookup:
    """Link and picture for one story. A temporary failure leaves image_checked False, so the next backfill retries."""
    result = ImageLookup()
    try:
        result.article_url = await resolve_google(url)
        if result.article_url:
            result.image = await page_image(result.article_url)
    except Exception as error:  # noqa: BLE001
        # One bad site must not stop the rest. "HTTP 403" etc. lets a later backfill retry blocked sites.
        result.image_error = f"{type(error).__name__}: {error}"[:200]
        result.image_checked = not is_temporary(error)
    return result


async def enrich(items: list, known: dict[str, ImageLookup], workers: int = 4) -> int:
    """
    Sets article_url and image on each story. `known` holds links already checked (from the database), which
    are reused; only new links are looked up, each once. Returns how many stories have an image.
    """
    urls = list({it.url for it in items if it.url and not it.image_set})
    fresh = [u for u in urls if u not in known]
    looked = await map_limit(fresh, workers, lookup)
    found = dict(known)
    for u, info in zip(fresh, looked):
        found[u] = info
    for it in items:
        info = found.get(it.url)
        if not info:
            continue
        it.article_url = info.article_url
        it.image = info.image
        it.image_set = True
        it.image_checked = info.image_checked
        it.image_error = info.image_error
    return sum(1 for it in items if it.image)
