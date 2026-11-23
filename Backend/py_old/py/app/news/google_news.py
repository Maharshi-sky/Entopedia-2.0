"""Google News search for one brand (port of news_scraper.py: google_news, mentions, dedupe, gather)."""
import hashlib
import os
import re
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import Optional
from urllib.parse import quote

from bs4 import BeautifulSoup

from app.news.http_client import fetch_with_fallback, sleep
from app.news.types import NewsBrand, Story

# Google News edition per country: (hl, gl, ceid)
EDITIONS: dict[str, tuple[str, str, str]] = {
    "IN": ("en-IN", "IN", "IN:en"),
    "US": ("en-US", "US", "US:en"),
    "UK": ("en-GB", "GB", "GB:en"),
    "AU": ("en-AU", "AU", "AU:en"),
    "SA": ("en-SA", "SA", "SA:en"),
    "DE": ("de", "DE", "DE:de"),
}


def _google_base() -> str:
    return (os.getenv("GOOGLE_NEWS_BASE_URL") or "https://news.google.com").rstrip("/")


def _search_pause_ms() -> int:
    return int(os.getenv("NEWS_SEARCH_PAUSE_MS", "1000"))


def search_url(query: str, days: int, country: str) -> str:
    hl, gl, ceid = EDITIONS[country]
    return f"{_google_base()}/rss/search?q={quote(f'{query} when:{days}d')}&hl={hl}&gl={gl}&ceid={ceid}"


def parse_feed(xml: str, query: str) -> list[Story]:
    soup = BeautifulSoup(xml, "xml")
    items: list[Story] = []
    for node in soup.find_all("item"):
        title_tag = node.find("title")
        link_tag = node.find("link")
        raw_title = " ".join((title_tag.get_text() if title_tag else "").split())
        link = (link_tag.get_text() if link_tag else "").strip()
        if not raw_title or not link:
            continue
        source_tag = node.find("source")
        publisher = (source_tag.get_text() if source_tag else "").strip()
        title = raw_title
        if publisher and title.endswith(f" - {publisher}"):
            title = title[: -(len(publisher) + 3)].strip()  # Google appends " - Publisher"
        pub_date_tag = node.find("pubDate")
        published: Optional[str] = None
        if pub_date_tag:
            try:
                dt = parsedate_to_datetime(pub_date_tag.get_text().strip())
                published = dt.isoformat()
            except (TypeError, ValueError):
                published = None
        items.append(Story(title=title, publisher=publisher, url=link, published=published, query=query))
    return items


async def search_google_news(query: str, days: int, country: str) -> tuple[list[Story], str]:
    page, via = await fetch_with_fallback(search_url(query, days, country))
    return parse_feed(page.text, query), via


def _escape_re(s: str) -> str:
    return re.escape(s)


def mentions(name: str, title: str) -> bool:
    """The headline names the brand as a word ("All Out", "All-Out", "Allout")."""
    parts = [_escape_re(p) for p in name.split() if p]
    # A name written in capitals ("HIT") is matched in capitals only: "Hit or Miss" and "hit-and-run" are
    # not the brand. Other names match in any case ("Mortein", "MORTEIN").
    case_sensitive = bool(re.match(r"^[^a-z]*[A-Z]{2,}[^a-z]*$", name))
    pattern = r"\b" + r"[\s\-]?".join(parts) + r"\b"
    flags = 0 if case_sensitive else re.I
    return bool(re.search(pattern, title, flags))


def normalise_headline(title: str) -> str:
    """Lower case, anything but letters and digits as a space, single spaces."""
    return re.sub(r"[^\w]+", " ", title.lower(), flags=re.UNICODE).strip()


def dedupe(items: list[Story]) -> list[Story]:
    """The same headline from several searches or outlets, once."""
    seen: set[str] = set()
    out = []
    for it in items:
        key = hashlib.md5(normalise_headline(it.title).encode()).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        out.append(it)
    return out


def brand_queries(brand: NewsBrand) -> list[str]:
    """The searches for one brand: '"Name"' alone, or '"Name" term' per extra term."""
    if brand.search_terms:
        return [f'"{brand.name}" {t}' for t in brand.search_terms]
    return [f'"{brand.name}"']


async def gather(brand: NewsBrand, days: int, country: str) -> tuple[list[Story], list[str]]:
    """All searches for one brand, duplicates removed. `searches` notes each query's count or failure."""
    items: list[Story] = []
    searches: list[str] = []
    queries = brand_queries(brand)
    for i, q in enumerate(queries):
        try:
            found, via = await search_google_news(q, days, country)
            items.extend(found)
            searches.append(f"{q}: {len(found)} ({via})")
        except Exception as error:  # noqa: BLE001
            searches.append(f"{q}: failed ({error})")
        if i < len(queries) - 1:
            await sleep(_search_pause_ms())
    return dedupe(items), searches
