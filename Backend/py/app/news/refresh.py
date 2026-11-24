"""
A news refresh: search Google News for every brand, sort the headlines (Groq model, or keyword
matching), look up links and pictures, save. Port of news_scraper.run + main.py's refresh endpoint.

Only one refresh runs at a time, across the API server, the schedule and the command line: the running
refresh is a row in news_refresh_runs with status 'running'.
"""
import asyncio
import json
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Optional

from app.db.connection import db
from app.news.classifier import PROMPT_VERSION, ai_available, ai_sort, is_market_report
from app.news.google_news import EDITIONS, gather
from app.news.rules import final_kind, is_blocked_source
from app.news.http_client import map_limit
from app.news.images import BLOCKED, enrich, lookup
from app.news.store import (
    active_brand_names, assign_clusters, known_images, load_brands, pending_image_urls, refresh_source_flags,
    remove_stories, save_image, save_results, saved_stories, save_verdicts, stored_verdicts, update_story_verdicts,
)
from app.news.types import NewsBrand, Story
from app.utils.logger import logger
from app.utils.tasks import spawn

STALE_MINUTES = 10
HEARTBEAT_S = 60
_LIVE_RUN = "status = 'running' AND COALESCE(heartbeat_at, started_at) > NOW() - make_interval(mins => $1)"


@dataclass
class RefreshOptions:
    days: int
    country: str
    ai: bool
    images: bool
    brands: Optional[list[str]] = None
    adhoc_brands: Optional[list[NewsBrand]] = None
    started_by: str = "cli"
    user_id: Optional[str] = None


class RefreshRunningError(Exception):
    def __init__(self, run: dict):
        super().__init__("A news refresh is already running")
        self.run = run


def validate_options(days: int, country: str) -> Optional[str]:
    if not isinstance(days, int) or days < 1 or days > 365:
        return "days must be a whole number from 1 to 365"
    if country not in EDITIONS:
        return f"country must be one of {', '.join(sorted(EDITIONS.keys()))}"
    return None


def _by_date(items: list[Story]) -> list[Story]:
    return sorted(items, key=lambda it: it.published or "", reverse=True)


def _settle(brand: NewsBrand, items: list[Story], tracked_brands: set[str]) -> None:
    """
    Final kind for every headline, from the model's (or a rule's) verdict checked by app/news/rules.py:
    "brand" only when the headline names the brand in context, "related" only when it is about household pest
    control, "company" for company news (shown on request), else "unrelated". Without a verdict (no model) the
    same checks sort by keyword.
    """
    company_tracked = bool(brand.company and brand.company.lower() in tracked_brands)
    for it in items:
        it.relevance = final_kind(brand, it.relevance, it.title, company_tracked)


def _drop_blocked_sources(items: list[Story]) -> list[Story]:
    """SEO list sites and market-research press-release mills, dropped before the model sees them."""
    blocked = [it for it in items if not it.relevance and is_blocked_source(it.publisher, it.url)]
    for it in blocked:
        it.relevance = "unrelated"
        it.category = "other"
    return blocked


async def _scrape_brand(
    brand: NewsBrand, days: int, country: str, ai_model: Optional[str], with_images: bool,
    tracked_brands: set[str], beat: Callable[[], Awaitable[None]],
) -> dict:
    """Search, sort and enrich one brand. `beat` keeps the refresh's heartbeat fresh during long model calls."""
    items, searches = await gather(brand, days, country)
    # Headlines judged before keep their verdict (with the model on: only verdicts from the current prompt and
    # model; an admin's "not relevant" always).
    known = await stored_verdicts(
        brand.name, [it.title for it in items], PROMPT_VERSION if ai_model else None, ai_model,
    )
    for it in items:
        k = known.get(it.title)
        if k:
            it.relevance = k["relevance"]
            it.category = k["category"]

    # Market-research press releases are dropped without asking the model.
    reports = [it for it in items if not it.relevance and is_market_report(it.title)]
    for it in reports:
        it.relevance = "unrelated"
        it.category = "other"
    await save_verdicts(brand.name, reports, "rule:market-report", PROMPT_VERSION)
    await save_verdicts(brand.name, _drop_blocked_sources(items), "rule:blocked-source", PROMPT_VERSION)

    todo = [it for it in items if not it.relevance]
    if ai_model is not None and todo:
        await ai_sort(brand, todo, beat)
        # Remember what the model decided (before keyword sorting fills any gaps), unrelated stories included.
        await save_verdicts(brand.name, todo, ai_model, PROMPT_VERSION)
    _settle(brand, items, tracked_brands)

    news = _by_date([it for it in items if it.relevance == "brand"])
    related = _by_date([it for it in items if it.relevance == "related"])
    company = _by_date([it for it in items if it.relevance == "company"])
    dropped_items = [it for it in items if it.relevance == "unrelated"]
    # A story saved by an earlier refresh and now judged unrelated is removed.
    removed = await remove_stories(brand.name, [it.title for it in dropped_items])
    with_image = 0
    if with_images and (news or related or company):
        all_items = [*news, *related, *company]
        known_imgs = await known_images(list({it.url for it in all_items}))
        with_image = await enrich(all_items, known_imgs)
    logger.info(
        f"News {brand.name}: {len(items)} found, {len(news)} about the brand, {len(related)} related, "
        f"{len(company)} company, {len(dropped_items)} unrelated removed"
        + (f" ({removed} saved earlier, now deleted)" if removed else "")
    )
    return {
        "about": brand.about, "searches": searches, "news": news, "related": related, "company": company,
        "dropped": len(dropped_items), "found": len(items), "withImage": with_image, "newCount": len(todo),
    }


async def _current_run() -> Optional[dict]:
    return await db.query_one(f"SELECT * FROM news_refresh_runs WHERE {_LIVE_RUN} ORDER BY started_at DESC LIMIT 1", [STALE_MINUTES])


async def close_stale_runs() -> None:
    """Marks refreshes left 'running' by a stopped process as failed."""
    await db.execute(
        """UPDATE news_refresh_runs SET status = 'failed', error = 'interrupted (the process stopped)', finished_at = NOW()
            WHERE status = 'running' AND COALESCE(heartbeat_at, started_at) <= NOW() - make_interval(mins => $1)""",
        [STALE_MINUTES],
    )


async def latest_run() -> Optional[dict]:
    """The latest refresh; a run left 'running' by a stopped process is closed first so it does not show as running forever."""
    await close_stale_runs()
    return await db.query_one("SELECT * FROM news_refresh_runs ORDER BY started_at DESC LIMIT 1")


async def _heartbeat_loop(run_id: int) -> None:
    try:
        while True:
            await asyncio.sleep(HEARTBEAT_S)
            try:
                await db.execute("UPDATE news_refresh_runs SET heartbeat_at = NOW() WHERE id = $1", [run_id])
            except Exception:  # noqa: BLE001
                pass
    except asyncio.CancelledError:
        pass


async def start_refresh(options: RefreshOptions) -> tuple[dict, asyncio.Task]:
    """
    Starts a refresh and returns its run row straight away; the work continues in the background and
    the returned task resolves to the finished run. Raises RefreshRunningError when one is already running.
    """
    invalid = validate_options(options.days, options.country)
    if invalid:
        raise ValueError(invalid)
    await close_stale_runs()

    brands = options.adhoc_brands if options.adhoc_brands else await load_brands(options.brands)
    if not brands:
        raise ValueError("No brands to search: add rows to news_brands or name a brand")

    ai_model: Optional[str] = None
    notes: dict = {}
    if options.ai:
        ai = await ai_available()
        if ai["ok"]:
            ai_model = ai["model"]
        else:
            notes["ai"] = f"keyword sorting only: {ai['reason']}"

    # Claim the lock: the insert only happens when no other refresh is running.
    run = await db.query_one(
        f"""INSERT INTO news_refresh_runs (status, started_by, user_id, days, country, ai_model, brands, notes, heartbeat_at)
            SELECT 'running', $2, $3, $4, $5, $6, $7, $8, NOW()
             WHERE NOT EXISTS (SELECT 1 FROM news_refresh_runs WHERE {_LIVE_RUN})
            RETURNING *""",
        [STALE_MINUTES, options.started_by, options.user_id, options.days, options.country, ai_model,
         [b.name for b in brands], json.dumps(notes)],
    )
    if not run:
        raise RefreshRunningError(await _current_run())

    tracked_brands = await active_brand_names()
    heartbeat_task = spawn(_heartbeat_loop(run["id"]))

    async def beat() -> None:
        try:
            await db.execute("UPDATE news_refresh_runs SET heartbeat_at = NOW() WHERE id = $1", [run["id"]])
        except Exception:  # noqa: BLE001
            pass

    async def _do_refresh() -> dict:
        results: dict[str, dict] = {}
        found = 0
        dropped = 0
        with_image = 0
        per_brand: dict[str, dict] = {}
        saved = 0

        async def progress(done: int, current: Optional[str]) -> None:
            await db.execute(
                "UPDATE news_refresh_runs SET notes = COALESCE(notes, '{}'::jsonb) || jsonb_build_object('progress', $2::jsonb) WHERE id = $1",
                [run["id"], json.dumps({"done": done, "total": len(brands), "current": current, "saved": saved})],
            )

        try:
            for i, brand in enumerate(brands):
                await progress(i, brand.name)
                r = await _scrape_brand(brand, options.days, options.country, ai_model, options.images, tracked_brands, beat)
                results[brand.name] = {
                    "about": r["about"], "searches": r["searches"], "news": r["news"], "related": r["related"],
                    "company": r["company"], "dropped": r["dropped"],
                }
                found += r["found"]
                dropped += r["dropped"]
                with_image += r["withImage"]
                per_brand[brand.name] = {
                    "searches": r["searches"], "about": len(r["news"]), "related": len(r["related"]),
                    "company": len(r["company"]), "dropped": r["dropped"], "new": r["newCount"],
                }
                # Save each brand as it finishes: the feed fills in during a long refresh, and a refresh that is
                # stopped part way keeps the brands it finished.
                saved += await save_results({brand.name: results[brand.name]}, options.country)
            await progress(len(brands), None)
            # One event reported by several outlets is shown once.
            await assign_clusters()
            finished = await db.query_one(
                """UPDATE news_refresh_runs SET status = 'done', found = $2, saved = $3, dropped = $4, with_image = $5,
                        notes = COALESCE(notes, '{}'::jsonb) || jsonb_build_object('brands', $6::jsonb), finished_at = NOW()
                    WHERE id = $1 RETURNING *""",
                [run["id"], found, saved, dropped, with_image if options.images else None, json.dumps(per_brand)],
            )
            logger.info(f"News refresh {run['id']} done: {saved} stories saved")
            return finished
        except Exception as error:  # noqa: BLE001
            logger.error(f"News refresh {run['id']} failed: {error}")
            failed = await db.query_one(
                "UPDATE news_refresh_runs SET status = 'failed', error = $2, finished_at = NOW() WHERE id = $1 RETURNING *",
                [run["id"], str(error)[:1000]],
            )
            return failed
        finally:
            heartbeat_task.cancel()

    done_task = spawn(_do_refresh())
    return run, done_task


async def backfill_images(
    limit: int = 500, workers: int = 4, retry_blocked: bool = False, retry_failed: bool = False
) -> dict:
    """Looks up pictures for stored stories not checked yet (and, with retry_blocked, those a site refused)."""
    urls = await pending_image_urls(limit, list(BLOCKED) if retry_blocked else None, retry_failed)
    with_image = 0

    async def _check(url: str) -> None:
        nonlocal with_image
        info = await lookup(url)
        await save_image(url, info)
        if info.image:
            with_image += 1

    await map_limit(urls, workers, _check)
    return {"checked": len(urls), "withImage": with_image}


async def rejudge_saved(names: Optional[list[str]] = None) -> list[dict]:
    """
    Judges a brand's saved stories again with the current prompt (news:rejudge), without searching
    Google: kind and category are updated, and stories now unrelated are removed. Needs the model.
    """
    ai = await ai_available()
    if not ai["ok"]:
        raise RuntimeError(f"The model is needed to judge stories again: {ai['reason']}")
    if await _current_run():
        raise RuntimeError("A news refresh is running; try again when it has finished")
    brands = await load_brands(names)
    tracked_brands = await active_brand_names()
    out = []
    for brand in brands:
        rows = await saved_stories(brand.name)
        items = [
            Story(
                title=r["title"], publisher=r["publisher"], url=r["url"],
                published=r["published"].isoformat() if hasattr(r["published"], "isoformat") else r["published"],
                query=r["query"],
            )
            for r in rows
        ]
        if not items:
            continue
        # An admin's "not relevant" stands; market reports and blocked sources are dropped by rule.
        human = await stored_verdicts(brand.name, [it.title for it in items], -1, "human")
        for it in items:
            if it.title in human:
                it.relevance = "unrelated"
            elif is_market_report(it.title):
                it.relevance, it.category = "unrelated", "other"
        _drop_blocked_sources(items)
        todo = [it for it in items if not it.relevance]
        if todo:
            await ai_sort(brand, todo)
            await save_verdicts(brand.name, todo, ai["model"], PROMPT_VERSION)
        _settle(brand, items, tracked_brands)
        keep = [it for it in items if it.relevance in ("brand", "related", "company")]
        await update_story_verdicts(
            brand.name,
            [{"title": it.title, "kind": it.relevance, "category": it.category or "other"} for it in keep],
        )
        removed = await remove_stories(brand.name, [it.title for it in items if it.relevance == "unrelated"])
        out.append({
            "brand": brand.name, "checked": len(items),
            "about": sum(1 for it in keep if it.relevance == "brand"),
            "related": sum(1 for it in keep if it.relevance == "related"),
            "company": sum(1 for it in keep if it.relevance == "company"),
            "removed": removed,
        })
    await refresh_source_flags()
    await assign_clusters()
    return out
