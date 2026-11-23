"""
Postgres storage for brand news (port of db.py / store.ts). Stories go into the existing
`news` table with origin = 'google_news'; one row per brand + headline (story_key).
"""
import hashlib
import json
import re
from typing import Optional

from app.db.connection import db
from app.news.categories import app_category
from app.news.google_news import normalise_headline
from app.news.images import ImageLookup
from app.news.rules import headline_tokens, is_indian_source, same_event
from app.news.types import NewsBrand, Relevance, Story

ORIGIN = "google_news"


def story_key(brand: str, title: str) -> str:
    """One row per brand + headline, so running the scraper again updates instead of duplicating."""
    return hashlib.md5(f"{brand.lower()}|{normalise_headline(title)}".encode()).hexdigest()


async def load_brands(names: Optional[list[str]] = None) -> list[NewsBrand]:
    rows = await db.query_many(
        """SELECT name, about, search_terms, company, exclude_terms, requires_context FROM news_brands
             WHERE is_active AND ($1::text[] IS NULL OR lower(name) = ANY($1::text[]))
             ORDER BY id""",
        [[n.lower() for n in names] if names else None],
    )
    return [
        NewsBrand(
            name=r["name"], about=r["about"], search_terms=r.get("search_terms") or [], company=r.get("company"),
            exclude_terms=r.get("exclude_terms") or [], requires_context=bool(r.get("requires_context")),
        )
        for r in rows
    ]


async def active_brand_names() -> set[str]:
    """Active brand names, lower case (to know whether a brand's company is tracked as a brand of its own)."""
    rows = await db.query_many("SELECT name FROM news_brands WHERE is_active")
    return {r["name"].lower() for r in rows}


HUMAN = "human"  # news_story_verdicts.model for an admin's decision; always reused, never asked again


async def stored_verdicts(
    brand: str, titles: list[str], prompt_version: Optional[int] = None, model: Optional[str] = None
) -> dict[str, dict]:
    """
    Verdicts already known for these headlines of one brand, so only new headlines go to the model.
    With `prompt_version` (the model is available): only verdicts from that prompt and, given `model`, that
    model (a smaller model's verdicts are asked again). Admin decisions are always reused.
    Without it (keyword sorting): any stored verdict, else the kind of a story saved earlier.
    """
    keys = {story_key(brand, t): t for t in titles}
    out: dict[str, dict] = {}
    if not keys:
        return out
    if prompt_version is not None:
        rows = await db.query_many(
            f"""SELECT story_key, relevance, category FROM news_story_verdicts
                 WHERE story_key = ANY($1::text[])
                   AND (model = '{HUMAN}'
                        OR (prompt_version = $2 AND ($3::text IS NULL OR model = $3 OR model LIKE 'rule:%')))""",
            [list(keys.keys()), prompt_version, model],
        )
    else:
        rows = await db.query_many(
            """SELECT story_key, relevance, category FROM news_story_verdicts WHERE story_key = ANY($1::text[])
               UNION ALL
               SELECT n.story_key, n.kind, n.source_category FROM news n
                WHERE n.story_key = ANY($1::text[])
                  AND NOT EXISTS (SELECT 1 FROM news_story_verdicts v WHERE v.story_key = n.story_key)""",
            [list(keys.keys())],
        )
    for r in rows:
        title = keys.get(r["story_key"])
        if title is not None:
            out[title] = {"relevance": r.get("relevance") or "brand", "category": r.get("category") or "other"}
    return out


async def save_verdicts(brand: str, items: list[Story], model: str, prompt_version: int) -> None:
    """Remembers the model's (or a rule's) verdicts, "unrelated" included."""
    decided = [it for it in items if it.relevance]
    if not decided:
        return
    await db.execute(
        """INSERT INTO news_story_verdicts (story_key, brand, title, relevance, category, model, prompt_version)
           SELECT k, b, t, r, c, m, $7 FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[]) AS x(k, b, t, r, c, m)
           ON CONFLICT (story_key) DO UPDATE SET relevance = EXCLUDED.relevance, category = EXCLUDED.category,
             model = EXCLUDED.model, prompt_version = EXCLUDED.prompt_version, decided_at = NOW()""",
        [
            [story_key(brand, it.title) for it in decided],
            [brand for _ in decided],
            [it.title for it in decided],
            [it.relevance for it in decided],
            [it.category or "other" for it in decided],
            [model for _ in decided],
            prompt_version,
        ],
    )


async def remove_stories(brand: str, titles: list[str]) -> int:
    """
    Removes a brand's saved stories that are no longer kept (now judged unrelated, or company news that the
    company's own row covers). Stories someone saved or put in a newsletter stay. Returns how many went.
    """
    if not titles:
        return 0
    keys = [story_key(brand, t) for t in titles]
    result = await db.execute(
        f"""DELETE FROM news n
             WHERE n.origin = '{ORIGIN}' AND n.story_key = ANY($1::text[])
               AND NOT EXISTS (SELECT 1 FROM saved_news s WHERE s.news_id = n.id)
               AND NOT EXISTS (SELECT 1 FROM newsletter_items i WHERE i.news_id = n.id)""",
        [keys],
    )
    match = re.search(r"\d+", result or "")
    return int(match.group()) if match else 0


async def saved_stories(brand: str) -> list[dict]:
    """A brand's saved stories, for judging them again with the current prompt (news:rejudge)."""
    return await db.query_many(
        f"""SELECT title, coalesce(source, '') AS publisher, url, published_date AS published, coalesce(search_query, '') AS query
              FROM news WHERE origin = '{ORIGIN}' AND brand = $1""",
        [brand],
    )


async def update_story_verdicts(brand: str, items: list[dict]) -> None:
    """Updates the kind and category of saved stories after judging them again."""
    for it in items:
        await db.execute(
            f"""UPDATE news SET kind = $2, source_category = $3, category = $4, updated_at = NOW()
                 WHERE story_key = $1 AND origin = '{ORIGIN}'""",
            [story_key(brand, it["title"]), it["kind"], it["category"], app_category(it["category"])],
        )


async def known_images(urls: list[str]) -> dict[str, ImageLookup]:
    """Links whose picture was already looked up, so each story is looked up once, not on every refresh."""
    out: dict[str, ImageLookup] = {}
    if not urls:
        return out
    rows = await db.query_many(
        """SELECT DISTINCT ON (url) url, article_url, image_url, image_error
             FROM news WHERE url = ANY($1::text[]) AND image_checked""",
        [urls],
    )
    for r in rows:
        out[r["url"]] = ImageLookup(
            article_url=r.get("article_url"), image=r.get("image_url"), image_checked=True, image_error=r.get("image_error")
        )
    return out


def _cut(s: Optional[str], n: int) -> Optional[str]:
    return None if s is None else s[:n]


async def save_results(results: dict[str, dict], country: str) -> int:
    """Upserts the scraper's results. Returns the number of stories written."""
    written = 0
    pool = db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            for brand, data in results.items():
                for kind, items in (("brand", data["news"]), ("related", data["related"]), ("company", data.get("company", []))):
                    for it in items:
                        with_image = it.image_set
                        if with_image:
                            await conn.execute(
                                f"""INSERT INTO news (origin, story_key, brand, kind, title, source, url, published_date, search_query,
                                                       source_category, category, country, article_url, image_url, image_checked, image_error, source_in)
                                    VALUES ('{ORIGIN}', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                                    ON CONFLICT (story_key) DO UPDATE SET
                                      brand = EXCLUDED.brand, kind = EXCLUDED.kind, title = EXCLUDED.title, source = EXCLUDED.source,
                                      url = EXCLUDED.url, published_date = EXCLUDED.published_date, search_query = EXCLUDED.search_query,
                                      source_category = EXCLUDED.source_category, category = EXCLUDED.category, country = EXCLUDED.country,
                                      article_url = EXCLUDED.article_url, image_url = EXCLUDED.image_url,
                                      image_checked = EXCLUDED.image_checked, image_error = EXCLUDED.image_error,
                                      source_in = EXCLUDED.source_in, updated_at = NOW()""",
                                story_key(brand, it.title), brand, kind, _cut(it.title, 500), _cut(it.publisher, 255),
                                it.url, it.published, it.query, it.category or "other", app_category(it.category), country,
                                it.article_url, it.image, it.image_checked if it.image_checked is not None else True,
                                _cut(it.image_error, 200), is_indian_source(it.publisher, it.article_url),
                            )
                        else:
                            await conn.execute(
                                f"""INSERT INTO news (origin, story_key, brand, kind, title, source, url, published_date, search_query,
                                                       source_category, category, country, source_in)
                                    VALUES ('{ORIGIN}', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                                    ON CONFLICT (story_key) DO UPDATE SET
                                      brand = EXCLUDED.brand, kind = EXCLUDED.kind, title = EXCLUDED.title, source = EXCLUDED.source,
                                      url = EXCLUDED.url, published_date = EXCLUDED.published_date, search_query = EXCLUDED.search_query,
                                      source_category = EXCLUDED.source_category, category = EXCLUDED.category, country = EXCLUDED.country,
                                      source_in = EXCLUDED.source_in, updated_at = NOW()""",
                                story_key(brand, it.title), brand, kind, _cut(it.title, 500), _cut(it.publisher, 255),
                                it.url, it.published, it.query, it.category or "other", app_category(it.category), country,
                                is_indian_source(it.publisher, None),
                            )
                        written += 1
    return written


async def pending_image_urls(limit: int, retry_blocked_codes: Optional[list[int]] = None, retry_all: bool = False) -> list[str]:
    """
    Story links whose picture still needs a look. With retry_blocked_codes, also those a site refused with one
    of these codes; with retry_all, every story that has no picture.
    """
    if retry_all:
        retry = "."
    elif retry_blocked_codes:
        codes = "|".join(str(c) for c in retry_blocked_codes)
        retry = f"^HttpError: HTTP ({codes})$"
    else:
        retry = None
    rows = await db.query_many(
        f"""SELECT url FROM (
              SELECT url, max(published_date) AS latest FROM news
               WHERE origin = '{ORIGIN}' AND url IS NOT NULL
                 AND (NOT image_checked OR ($2::text IS NOT NULL AND image_url IS NULL AND coalesce(image_error, '-') ~ $2::text))
               GROUP BY url
            ) pending ORDER BY latest DESC NULLS LAST LIMIT $1""",
        [limit, retry],
    )
    return [r["url"] for r in rows]


async def image_report() -> dict:
    """Picture lookup results, for `news images --report`."""
    totals = await db.query_one(
        f"""SELECT COUNT(*)::int AS stories,
                   COUNT(image_url)::int AS with_image,
                   COUNT(*) FILTER (WHERE NOT image_checked)::int AS not_checked,
                   COUNT(*) FILTER (WHERE image_checked AND image_url IS NULL)::int AS no_image
              FROM news WHERE origin = '{ORIGIN}'"""
    )
    reasons = await db.query_many(
        f"""SELECT CASE
                     WHEN image_error IS NOT NULL THEN image_error
                     WHEN article_url IS NULL THEN 'publisher link not found (Google link could not be resolved)'
                     ELSE 'publisher page has no preview picture'
                   END AS reason,
                   COUNT(*)::int AS stories
              FROM news WHERE origin = '{ORIGIN}' AND image_checked AND image_url IS NULL
             GROUP BY 1 ORDER BY 2 DESC LIMIT 10"""
    )
    return {"totals": totals, "reasons": reasons}


async def save_image(url: str, info: ImageLookup) -> None:
    await db.execute(
        f"""UPDATE news SET article_url = $2, image_url = $3, image_checked = $4, image_error = $5, updated_at = NOW()
             WHERE url = $1 AND origin = '{ORIGIN}'""",
        [url, info.article_url, info.image, info.image_checked, _cut(info.image_error, 200)],
    )


async def assign_clusters(days: int = 90) -> int:
    """
    Gives stories that report the same event (several outlets, different headlines) one cluster_key, so the
    News page shows the event once with its other sources. Compares stories published within 4 days of each
    other. Returns how many stories changed cluster.
    """
    rows = await db.query_many(
        f"""SELECT id::text AS id, title, published_date, cluster_key FROM news
             WHERE origin = '{ORIGIN}' AND published_date > NOW() - make_interval(days => $1)
             ORDER BY published_date ASC NULLS LAST""",
        [days],
    )
    clusters: list[dict] = []  # {"key", "tokens", "at"}
    changes: list[tuple[str, str]] = []
    for r in rows:
        tokens = headline_tokens(r["title"])
        at = r["published_date"]
        match = next(
            (
                c for c in reversed(clusters)
                if at is not None and c["at"] is not None and abs((at - c["at"]).total_seconds()) <= 4 * 86400
                and same_event(tokens, c["tokens"])
            ),
            None,
        )
        if match:
            match["tokens"] |= tokens
            key = match["key"]
        else:
            key = r["id"]
            clusters.append({"key": key, "tokens": set(tokens), "at": at})
        if r["cluster_key"] != key:
            changes.append((r["id"], key))
    for story_id, key in changes:
        await db.execute("UPDATE news SET cluster_key = $2 WHERE id::text = $1", [story_id, key])
    return len(changes)


async def refresh_source_flags() -> int:
    """Sets source_in (Indian outlet) where it is missing or no longer matches the publisher."""
    rows = await db.query_many(f"SELECT id::text AS id, source, article_url, source_in FROM news WHERE origin = '{ORIGIN}'")
    changed = 0
    for r in rows:
        flag = is_indian_source(r["source"], r["article_url"])
        if r["source_in"] is not flag:
            await db.execute("UPDATE news SET source_in = $2 WHERE id::text = $1", [r["id"], flag])
            changed += 1
    return changed


async def dismiss_story(news_id: str) -> Optional[dict]:
    """
    An admin marks a story not relevant: every row of that headline (one per brand) is removed and an admin
    verdict is stored, so later refreshes leave it out without asking the model. Stories someone saved or put
    in a newsletter stay. Returns the story, or None.
    """
    story = await db.query_one(
        f"SELECT id, title, headline_key FROM news WHERE id::text = $1 AND origin = '{ORIGIN}'", [news_id]
    )
    if not story:
        return None
    rows = await db.query_many(
        f"SELECT story_key, brand, title FROM news WHERE origin = '{ORIGIN}' AND (headline_key = $1 OR id::text = $2)",
        [story["headline_key"], news_id],
    )
    keys = [r["story_key"] for r in rows]
    await db.execute(
        f"""INSERT INTO news_story_verdicts (story_key, brand, title, relevance, category, model, prompt_version)
            SELECT k, b, t, 'unrelated', 'other', '{HUMAN}', 0 FROM unnest($1::text[], $2::text[], $3::text[]) AS x(k, b, t)
            ON CONFLICT (story_key) DO UPDATE SET relevance = 'unrelated', model = '{HUMAN}', decided_at = NOW()""",
        [keys, [r["brand"] or "" for r in rows], [r["title"] for r in rows]],
    )
    await db.execute(
        f"""DELETE FROM news n WHERE n.origin = '{ORIGIN}' AND n.story_key = ANY($1::text[])
              AND NOT EXISTS (SELECT 1 FROM saved_news s WHERE s.news_id = n.id)
              AND NOT EXISTS (SELECT 1 FROM newsletter_items i WHERE i.news_id = n.id)""",
        [keys],
    )
    return {"title": story["title"], "rows": len(rows)}
