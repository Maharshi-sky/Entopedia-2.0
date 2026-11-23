"""
Background news jobs started with the API server:
  - stories saved without a picture lookup are checked once (as main.py did on start)
  - with NEWS_AUTO_REFRESH=true, a refresh runs on NEWS_REFRESH_CRON (default every 6 hours)
"""
import asyncio
import os

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.news.refresh import RefreshOptions, RefreshRunningError, backfill_images, close_stale_runs, start_refresh
from app.utils.logger import logger
from app.utils.tasks import spawn

_scheduler: AsyncIOScheduler | None = None


def refresh_defaults() -> dict:
    return {
        "days": int(os.getenv("NEWS_REFRESH_DAYS", "30")),
        "country": (os.getenv("NEWS_REFRESH_COUNTRY") or "IN").upper(),
    }


async def _run_scheduled_refresh() -> None:
    defaults = refresh_defaults()
    try:
        _run, task = await start_refresh(RefreshOptions(days=defaults["days"], country=defaults["country"], ai=True, images=True, started_by="schedule"))
        await task
    except RefreshRunningError:
        logger.info("News: scheduled refresh skipped, one is already running")
    except Exception as error:  # noqa: BLE001
        logger.error(f"News: scheduled refresh could not start: {error}")


async def start_news_jobs() -> None:
    global _scheduler
    try:
        await close_stale_runs()
    except Exception as error:  # noqa: BLE001
        logger.warning(f"News: could not check for interrupted refreshes ({error}). Run python -m app.migrations.run (migrations 05 and 06).")
        return

    if os.getenv("NEWS_IMAGE_BACKFILL_ON_START", "true") != "false":
        async def _backfill() -> None:
            try:
                result = await backfill_images()
                if result["checked"]:
                    logger.info(f"News images: checked {result['checked']} stories, {result['withImage']} have an image")
            except Exception as error:  # noqa: BLE001
                logger.warning(f"News images: backfill failed ({error})")

        spawn(_backfill())

    if os.getenv("NEWS_AUTO_REFRESH") == "true":
        expression = os.getenv("NEWS_REFRESH_CRON") or "0 */6 * * *"
        try:
            trigger = CronTrigger.from_crontab(expression, timezone=os.getenv("NEWS_REFRESH_TIMEZONE") or "Asia/Kolkata")
        except ValueError:
            logger.error(f'News: NEWS_REFRESH_CRON "{expression}" is not a valid cron expression; automatic refresh is off')
            return

        _scheduler = AsyncIOScheduler()
        _scheduler.add_job(_run_scheduled_refresh, trigger, id="news-refresh", max_instances=1, coalesce=True)
        _scheduler.start()
        logger.info(f'News: automatic refresh on "{expression}"')
