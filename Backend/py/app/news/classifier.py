"""
Sorts headlines for one brand (about the brand / its company / related / unrelated) and tags a category,
with a Groq model, GROQ_NEWS_MODEL (port of news_scraper.ai_sort, which used OpenAI gpt-4o-mini).
When Groq cannot be used (no key, usage limit) the scraper falls back to keyword sorting.

PROMPT_VERSION goes into every stored verdict. Raise it whenever the prompt or the rules change: stored
verdicts from an older version are then asked again instead of being reused.
"""
import json
import os
import re
from typing import Awaitable, Callable, Optional

from app.news.types import NewsBrand, Relevance, Story
from app.services import groq_service as groq
from app.services.groq_service import groq_service
from app.utils.logger import logger

PROMPT_VERSION = 3  # 3: related limited to household pest control; checks in app/news/rules.py

CATEGORIES = [
    "product launch", "marketing & ads", "business & financial", "stock market list",
    "regulatory & legal", "safety & recall", "competitor & market", "people & CSR",
    "review & opinion", "other",
]


def news_model() -> str:
    """The model used for sorting: GROQ_NEWS_MODEL, else llama-3.1-8b-instant."""
    return groq.news_model()


def _batch_size() -> int:
    """Headlines per model call. Smaller batches finish sooner on a laptop and fail less."""
    return max(1, int(os.getenv("NEWS_AI_BATCH_SIZE", "20")))


def relevance_options(brand: NewsBrand) -> list[str]:
    """The labels the model may give for this brand: "company" only when the brand belongs to a company."""
    return ["brand", "company", "related", "unrelated"] if brand.company else ["brand", "related", "unrelated"]


def _reply_schema(brand: NewsBrand) -> dict:
    return {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "i": {"type": "integer"},
                        "relevance": {"type": "string", "enum": relevance_options(brand)},
                        "category": {"type": "string", "enum": CATEGORIES},
                    },
                    "required": ["i", "relevance", "category"],
                },
            }
        },
        "required": ["items"],
    }


def system_prompt(brand: NewsBrand) -> str:
    label = f'"{brand.name}"' + (f" ({brand.about})" if brand.about else "")
    company = brand.company
    lines = [
        f"You sort news for a monitor of the brand {label}" + (f", made by {company}" if company else "") + ".",
        "Google News found each story by searching for the brand name; when the headline does not name the "
        "brand, the name was found inside the article.",
        "For each numbered headline give:",
        "- relevance:",
        '    "brand"     the headline is about this brand or one of its products. This includes any story in '
        "which the actual product appears, even a crime, accident or misuse involving it.",
    ]
    if company:
        lines.append(
            f'    "company"   the headline is about {company} as a company (results, revenue, shares, strategy, '
            "leadership) and not about this brand in particular."
        )
    lines.append(
        '    "related"   the headline does not name this brand but is about household pest control: mosquito, '
        "cockroach or insect repellents and killers, or the diseases and pests they fight (a rival's launch, a "
        "category trend, a regulation, a dengue or malaria drive). Nothing outside pest control is related."
    )
    lines.append('    "unrelated" anything else, including:')
    lines.append(
        '                the brand name used as an ordinary word or phrase ("hit-and-run", "a box office hit", '
        '"goes all out", "all-out war", "good night")'
    )
    lines.append(
        "                other businesses of the same group outside this product category (property, finance, "
        "food, chemicals)"
    )
    lines.append('                market research press releases ("market size, share, growth forecast", "CAGR")')
    lines.append(
        "                general news on a topic (a disease outbreak, the weather, protests, a film, a crime "
        "without the product)"
    )
    lines.append(
        "                If unsure between brand and unrelated, choose unrelated, unless the headline clearly "
        "refers to the product."
    )
    lines.append(
        f"- category: one of {json.dumps(CATEGORIES)}. \"stock market list\" is for stock tips, market movers and "
        'share-price roundups that only list the company among others.'
    )
    lines.append("Judge from the headline only; do not assume facts that are not in it.")
    lines.append('Give exactly one entry per headline, using its number as "i".')
    lines.append('Reply as JSON: {"items": [{"i": 0, "relevance": "brand", "category": "..."}]}')
    return "\n".join(lines)


# Market-research press releases ("Mosquito Racket Market Size, Share | Growth Forecast [2034]"): dropped
# without asking the model.
_MARKET_REPORT = re.compile(
    r"\bmarket\s+(size|share|report|analysis|outlook|insights?|trends?)\b|\bCAGR\b|"
    r"\bforecast\s*(?:\[|\(|to|till|by|period)?\s*20\d\d\b|\b20\d\d\s*[-–]\s*20\d\d\b.*\bmarket\b",
    re.I,
)


def is_market_report(title: str) -> bool:
    return bool(_MARKET_REPORT.search(title))


async def ai_available() -> dict:
    """Can the model be used? Checked once per refresh, so a missing key is reported once instead of per batch."""
    model = news_model()
    status = await groq_service.get_status()
    return {"ok": True, "model": model} if status["available"] else {"ok": False, "model": model, "reason": status["reason"]}


async def ai_sort(brand: NewsBrand, items: list[Story], on_batch: Optional[Callable[[], Awaitable[None]]] = None) -> bool:
    """
    Sets relevance and category on each item, from the headline. Returns False if any batch could not be
    sorted (those items keep no relevance and are sorted by keyword by the caller). `on_batch` runs after
    each model call (the refresh uses it as a heartbeat).
    """
    size = _batch_size()
    allowed = relevance_options(brand)
    ok = True
    for start in range(0, len(items), size):
        batch = items[start : start + size]
        prompt = "\n".join(f"{i}. {it.title} ({it.publisher})" for i, it in enumerate(batch))
        try:
            reply = await groq_service.chat_json(
                prompt=prompt, system=system_prompt(brand), model=news_model(),
                schema=_reply_schema(brand), temperature=0,
                timeout_ms=int(os.getenv("NEWS_AI_TIMEOUT_MS", "180000")),
            )
            for v in reply.get("items") or []:
                i = v.get("i")
                if not isinstance(i, int) or i < 0 or i >= len(batch):
                    continue
                rel = v.get("relevance")
                batch[i].relevance = rel if rel in allowed else "unrelated"
                category = v.get("category")
                batch[i].category = category if category in CATEGORIES else "other"
        except Exception as error:  # noqa: BLE001
            logger.warning(f"News AI sort failed for {brand.name} ({error}); these headlines are sorted by keyword")
            ok = False
        if on_batch:
            await on_batch()
    return ok
