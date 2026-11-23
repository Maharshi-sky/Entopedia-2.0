"""
News from the command line (the Python version's news_scraper.py and images.py):

  python -m app.news.cli refresh                                   every active brand, last 30 days, India
  python -m app.news.cli refresh --brand "Mortein"                  one brand from news_brands
  python -m app.news.cli refresh --brand "Baygon | Bayer's insect spray brand | spray"   a brand not in the table
  python -m app.news.cli refresh --days 7 --country US              IN, US, UK, AU, SA, DE
  python -m app.news.cli refresh --no-ai                            keyword sorting only (no Ollama)
  python -m app.news.cli refresh --no-images                        skip looking up article pictures
  python -m app.news.cli images                                     pictures for stories not checked yet
  python -m app.news.cli images --retry-blocked                     also try again the sites that refused (via Zyte when set)
  python -m app.news.cli images --retry-failed                      look again for every story without a picture
  python -m app.news.cli images --report                            how many stories have a picture, and why the rest do not
  python -m app.news.cli rejudge                                    judge every saved story again with the current prompt
  python -m app.news.cli rejudge --brand HIT                        only one brand
"""
import argparse
import asyncio
import sys

from dotenv import load_dotenv

load_dotenv()

from app.db.connection import db  # noqa: E402
from app.news.refresh import RefreshOptions, RefreshRunningError, backfill_images, rejudge_saved, start_refresh  # noqa: E402
from app.news.scheduler import refresh_defaults  # noqa: E402
from app.news.store import image_report, load_brands  # noqa: E402
from app.news.types import NewsBrand  # noqa: E402


def parse_brand(line: str) -> NewsBrand:
    """'Name | what it is | extra, search, terms' (the brands.txt form). The last two are optional."""
    parts = [p.strip() for p in line.split("|")]
    name = parts[0] if len(parts) > 0 else ""
    about = parts[1] if len(parts) > 1 else ""
    terms = parts[2] if len(parts) > 2 else ""
    return NewsBrand(name=name, about=about, search_terms=[t.strip() for t in terms.split(",") if t.strip()])


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("command", choices=["refresh", "images", "rejudge"])
    parser.add_argument("--brand", action="append", dest="brands", default=[])
    parser.add_argument("--days", type=int, default=None)
    parser.add_argument("--country", type=str, default=None)
    parser.add_argument("--no-ai", action="store_false", dest="ai", default=True)
    parser.add_argument("--no-images", action="store_false", dest="images", default=True)
    parser.add_argument("--retry-blocked", action="store_true", dest="retry_blocked", default=False)
    parser.add_argument("--retry-failed", action="store_true", dest="retry_failed", default=False)
    parser.add_argument("--report", action="store_true", default=False)
    return parser.parse_args(argv)


async def main() -> None:
    a = _parse_args(sys.argv[1:])
    if a.country:
        a.country = a.country.upper()
    await db.connect()
    try:
        if a.command == "images":
            if a.report:
                report = await image_report()
                totals = report["totals"]
                print(
                    f"Stories: {totals['stories']} · with a picture: {totals['with_image']} · "
                    f"not looked up yet: {totals['not_checked']} · no picture: {totals['no_image']}"
                )
                if report["reasons"]:
                    print("\nWhy stories have no picture:")
                    for r in report["reasons"]:
                        print(f"  {str(r['stories']).rjust(4)}  {r['reason']}")
                return
            result = await backfill_images(retry_blocked=a.retry_blocked, retry_failed=a.retry_failed)
            print(f"Looked up {result['checked']} stories, {result['withImage']} have an image")
            return

        if a.command == "rejudge":
            names = [parse_brand(b).name for b in a.brands] if a.brands else None
            results = await rejudge_saved(names)
            if not results:
                print("No saved stories to judge.")
            for r in results:
                print(f"{r['brand']}: {r['checked']} checked · {r['about']} about the brand · {r['related']} related · {r['removed']} removed")
            return

        # refresh: a --brand that names a row of news_brands uses that row; anything else is taken as a brands.txt line.
        adhoc = None
        names = None
        if a.brands:
            parsed = [parse_brand(b) for b in a.brands]
            stored = await load_brands([p.name for p in parsed])
            stored_names = {b.name.lower() for b in stored}
            missing = [p for p in parsed if p.name.lower() not in stored_names]
            if missing:
                adhoc = [*stored, *missing]
            else:
                names = [b.name for b in stored]

        defaults = refresh_defaults()
        run, task = await start_refresh(RefreshOptions(
            days=a.days if a.days is not None else defaults["days"],
            country=a.country or defaults["country"],
            ai=a.ai, images=a.images, brands=names, adhoc_brands=adhoc, started_by="cli",
        ))
        ai_model = run.get("ai_model")
        print(
            f"Refresh {run['id']}: {', '.join(run['brands'])} · last {run['days']} days · {run['country']} · "
            f"{f'sorted by {ai_model}' if ai_model else 'keyword sorting'}"
        )
        notes = run.get("notes") or {}
        if isinstance(notes, str):
            import json
            notes = json.loads(notes)
        if notes.get("ai"):
            print(f"  {notes['ai']}")
        finished = await task
        if finished["status"] == "failed":
            raise RuntimeError(finished.get("error") or "refresh failed")
        finished_notes = finished.get("notes") or {}
        if isinstance(finished_notes, str):
            import json
            finished_notes = json.loads(finished_notes)
        per_brand = finished_notes.get("brands") or {}
        for name in finished["brands"]:
            b = per_brand.get(name)
            if not b:
                continue
            print(f"\n== {name}")
            for s in b["searches"]:
                print(f"   {s}")
            print(f"   {b['about']} about the brand, {b['related']} related, {b['dropped']} unrelated removed")
        with_image = finished.get("with_image")
        print(f"\nSaved {finished['saved']} stories ({finished['found']} found" + (f", {with_image} with a picture)" if with_image is not None else ")"))
    finally:
        await db.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except RefreshRunningError as error:
        print(f"A refresh is already running (started {error.run['started_at']})", file=sys.stderr)
        sys.exit(1)
    except Exception as error:  # noqa: BLE001
        print(str(error), file=sys.stderr)
        sys.exit(1)
