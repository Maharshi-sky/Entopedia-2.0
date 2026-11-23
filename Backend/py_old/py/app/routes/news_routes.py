import re

from fastapi import APIRouter, Depends, HTTPException, Response

from app.db.connection import db
from app.middleware.auth import AuthUser, get_current_user, require_roles
from app.news.http_client import HttpError
from app.news.image_proxy import cached_image
from app.news.refresh import RefreshOptions, RefreshRunningError, start_refresh, validate_options
from app.news.refresh import latest_run as news_latest_run
from app.news.scheduler import refresh_defaults
from app.utils.logger import logger
from app.utils.range import clamp_int

router = APIRouter(dependencies=[Depends(get_current_user)])

LIST_COLUMNS = """id, title, source, category, published_date, ai_summary, url, created_at,
  origin, brand, kind, source_category, article_url, image_url, country"""

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


@router.get("")
@router.get("/")
async def list_news(
    limit: int | str | None = None, offset: int | str | None = None,
    category: str | None = None, brand: str | None = None, kind: str | None = None,
    origin: str | None = None, saved_only: str | None = None,
    user: AuthUser = Depends(get_current_user),
):
    try:
        limit_v = clamp_int(limit, 50, 1, 500)
        offset_v = clamp_int(offset, 0, 0, 1_000_000)
        where: list[str] = []
        params: list = []

        def add(sql: str, value) -> None:
            params.append(value)
            where.append(sql.replace("?", f"${len(params)}"))

        if category:
            add("category = ?", category)
        if brand:
            add("brand = ?", brand)
        if kind in ("brand", "related"):
            add("kind = ?", kind)
        if origin in ("google_news", "manual"):
            add("origin = ?", origin)
        if saved_only == "true":
            add("id IN (SELECT news_id FROM saved_news WHERE user_id = ?)", user.id)

        filter_sql = f" WHERE {' AND '.join(where)}" if where else ""
        # The same headline saved for several brands is one story: the row about the brand is shown, with
        # every brand (and whether it is about the brand or related) in `brands`.
        group = "COALESCE(CASE WHEN origin = 'google_news' THEN headline_key END, id::text)"

        news = await db.query_many(
            f"""WITH f AS (SELECT {LIST_COLUMNS}, {group} AS grp FROM news{filter_sql}),
                  g AS (
                    SELECT DISTINCT ON (grp) f.*,
                           (SELECT json_agg(json_build_object('brand', x.brand, 'kind', x.kind)
                                            ORDER BY (x.kind = 'brand') DESC, x.brand)
                              FROM f x WHERE x.grp = f.grp AND x.brand IS NOT NULL) AS brands
                      FROM f
                     ORDER BY grp, (kind = 'brand') DESC NULLS LAST, published_date DESC NULLS LAST
                  )
             SELECT {LIST_COLUMNS}, brands FROM g
              ORDER BY published_date DESC NULLS LAST, created_at DESC
              LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}""",
            [*params, limit_v, offset_v],
        )
        total = await db.query_one(f"SELECT COUNT(DISTINCT {group})::int AS count FROM news{filter_sql}", params)

        return {"data": news, "pagination": {"limit": limit_v, "offset": offset_v, "total": total["count"] if total else 0}}
    except Exception as error:  # noqa: BLE001
        logger.error(f"News list error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch news")


@router.get("/brands")
async def list_brands():
    try:
        brands = await db.query_many(
            """SELECT b.name, b.about, b.search_terms, b.company, b.is_active,
                      (SELECT COUNT(*)::int FROM news n WHERE n.brand = b.name) AS stories,
                      (SELECT MAX(n.published_date) FROM news n WHERE n.brand = b.name) AS latest
                 FROM news_brands b ORDER BY b.id"""
        )
        return {"data": brands}
    except Exception as error:  # noqa: BLE001
        logger.error(f"News brands error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch news brands")


@router.get("/refresh", dependencies=[Depends(require_roles("admin"))])
async def refresh_status():
    try:
        run = await news_latest_run()
        return run or {"status": "idle"}
    except Exception as error:  # noqa: BLE001
        logger.error(f"News refresh status error: {error}")
        raise HTTPException(status_code=500, detail="Failed to read refresh status")


@router.post("/refresh", status_code=202, dependencies=[Depends(require_roles("admin"))])
async def trigger_refresh(
    days: int | None = None, country: str | None = None, ai: str | None = None, images: str | None = None,
    brand: list[str] | str | None = None, user: AuthUser = Depends(get_current_user),
):
    defaults = refresh_defaults()
    days_v = defaults["days"] if days is None else days
    country_v = country.upper() if country else defaults["country"]
    invalid = validate_options(days_v, country_v)
    if invalid:
        raise HTTPException(status_code=400, detail=invalid)

    brands = None
    if isinstance(brand, str) and brand:
        brands = [brand]
    elif isinstance(brand, list) and brand:
        brands = [str(b) for b in brand]

    try:
        run, task = await start_refresh(RefreshOptions(
            days=days_v, country=country_v, ai=ai != "false", images=images != "false",
            brands=brands, started_by="admin", user_id=user.id,
        ))
        return run
    except RefreshRunningError as error:
        raise HTTPException(status_code=409, detail={"error": str(error), "run": error.run})
    except Exception as error:  # noqa: BLE001
        logger.error(f"News refresh start error: {error}")
        raise HTTPException(status_code=400, detail=str(error))


@router.get("/categories/list")
async def categories_list():
    try:
        categories = await db.query_many("SELECT DISTINCT category FROM news WHERE category IS NOT NULL ORDER BY category")
        return {"categories": [c["category"] for c in categories]}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Categories fetch error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch categories")


@router.get("/{news_id}/image")
async def news_image(news_id: str):
    if not UUID_RE.match(news_id):
        raise HTTPException(status_code=404, detail="News not found")
    try:
        story = await db.query_one("SELECT image_url, article_url FROM news WHERE id = $1", [news_id])
        if not story or not story.get("image_url"):
            raise HTTPException(status_code=404, detail="This story has no picture")

        image = await cached_image(story["image_url"], story.get("article_url"))
        return Response(
            content=image.bytes_,
            media_type=image.type,
            headers={
                "Cache-Control": "private, max-age=86400",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'none'; sandbox",
            },
        )
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        message = str(error)
        logger.warning(f"News image {news_id}: {message}")
        # A picture that is gone for good (not found, refused, not an image) is dropped, so pages stop asking
        # for it and show the publisher tile. Timeouts and server errors may pass, so those are kept.
        permanent = (
            isinstance(error, HttpError) and error.status in (401, 403, 404, 410)
        ) or bool(re.search(r"not a picture|larger than|public address|only http", message))
        if permanent:
            try:
                await db.execute(
                    "UPDATE news SET image_url = NULL, image_error = $2, updated_at = NOW() WHERE id = $1",
                    [news_id, f"picture unavailable: {message}"[:200]],
                )
            except Exception:  # noqa: BLE001
                pass
        raise HTTPException(status_code=502, detail="The publisher did not return the picture")


@router.get("/{news_id}")
async def news_detail(news_id: str):
    if not UUID_RE.match(news_id):
        raise HTTPException(status_code=404, detail="News not found")
    try:
        news = await db.query_one(f"SELECT {LIST_COLUMNS}, content FROM news WHERE id = $1", [news_id])
        if not news:
            raise HTTPException(status_code=404, detail="News not found")
        return news
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(f"News detail error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch news")


@router.post("/{news_id}/save")
async def save_news(news_id: str, user: AuthUser = Depends(get_current_user)):
    try:
        await db.execute(
            "INSERT INTO saved_news (user_id, news_id, saved_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING",
            [user.id, news_id],
        )
        return {"message": "News saved"}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Save news error: {error}")
        raise HTTPException(status_code=500, detail="Failed to save news")


@router.post("/{news_id}/add-to-newsletter")
async def add_to_newsletter(news_id: str, body: dict | None = None):
    try:
        newsletter_id = (body or {}).get("newsletter_id")
        await db.execute(
            """INSERT INTO newsletter_items (newsletter_id, news_id, position)
               VALUES ($1, $2, (SELECT COALESCE(MAX(position), 0) + 1 FROM newsletter_items WHERE newsletter_id = $1))""",
            [newsletter_id, news_id],
        )
        return {"message": "Added to newsletter"}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Add to newsletter error: {error}")
        raise HTTPException(status_code=500, detail="Failed to add to newsletter")
