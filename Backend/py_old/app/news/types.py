"""
A brand to track (table news_brands), and one headline found on Google News,
enriched step by step.
"""
from dataclasses import dataclass, field
from typing import Literal, Optional

Relevance = Literal["brand", "company", "related", "unrelated"]


@dataclass
class NewsBrand:
    name: str
    about: str
    search_terms: list[str] = field(default_factory=list)
    company: Optional[str] = None


@dataclass
class Story:
    title: str
    publisher: str
    url: str
    published: Optional[str]
    query: str
    relevance: Optional[Relevance] = None
    category: Optional[str] = None
    article_url: Optional[str] = None
    image: Optional[str] = None
    image_set: bool = False  # tracks whether `image` was explicitly assigned (TS `undefined` vs null)
    image_checked: Optional[bool] = None
    image_error: Optional[str] = None


@dataclass
class BrandResult:
    about: str
    searches: list[str]
    news: list[Story]
    related: list[Story]
    dropped: int
