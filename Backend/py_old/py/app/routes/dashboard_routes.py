from fastapi import APIRouter, Depends, HTTPException, Request

from app.db.connection import db
from app.middleware.auth import AuthUser, get_current_user
from app.utils.logger import logger
from app.utils.range import clamp_int, to_interval

router = APIRouter(dependencies=[Depends(get_current_user)])


async def _count(sql: str, params: list) -> int:
    row = await db.query_one(sql, params)
    return int(row["count"]) if row and row.get("count") is not None else 0


async def _weekly_trend(table: str, column: str, where: str = "TRUE", weeks: int = 10) -> list[int]:
    """Weekly counts for the last `weeks` weeks, oldest first, zero-filled."""
    rows = await db.query_many(
        f"""SELECT w.week, COUNT(t.{column})::int AS count
              FROM generate_series(DATE_TRUNC('week', NOW()) - ($1::int - 1) * INTERVAL '1 week', DATE_TRUNC('week', NOW()), INTERVAL '1 week') AS w(week)
              LEFT JOIN {table} t ON DATE_TRUNC('week', t.{column}) = w.week AND {where}
             GROUP BY w.week
             ORDER BY w.week ASC""",
        [weeks],
    )
    return [int(r["count"]) for r in rows]


@router.get("/kpis")
async def kpis(request: Request, range: str = "30d", user: AuthUser = Depends(get_current_user)):
    try:
        interval = to_interval(range)

        competitors = await _count("SELECT COUNT(*) AS count FROM competitors WHERE last_updated > NOW() - $1::text::interval", [interval])
        patents = await _count("SELECT COUNT(*) AS count FROM patents WHERE filing_date > NOW() - $1::text::interval", [interval])
        news = await _count("SELECT COUNT(*) AS count FROM news WHERE published_date > NOW() - $1::text::interval", [interval])
        # threat_score is DECIMAL(3,2) on a 0-1 scale, so "high threat" is >= 0.7 (not > 7).
        threats = await _count(
            "SELECT COUNT(*) AS count FROM patents WHERE threat_score >= 0.7 AND filing_date > NOW() - $1::text::interval", [interval]
        )
        claims = await _count("SELECT COUNT(*) AS count FROM product_claims WHERE created_at > NOW() - $1::text::interval", [interval])
        alerts = await _count(
            "SELECT COUNT(*) AS count FROM alerts WHERE severity IN ('high', 'critical') AND created_at > NOW() - $1::text::interval AND (user_id = $2 OR user_id IS NULL)",
            [interval, user.id],
        )

        patent_trend = await _weekly_trend("patents", "filing_date")
        news_trend = await _weekly_trend("news", "published_date")
        claim_trend = await _weekly_trend("product_claims", "created_at")
        alert_trend = await _weekly_trend("alerts", "created_at", "t.severity IN ('high', 'critical')")

        return {
            "metrics": {"competitors": competitors, "patents": patents, "news": news, "threats": threats, "claims": claims, "alerts": alerts},
            "trends": {"patents": patent_trend, "news": news_trend, "claims": claim_trend, "alerts": alert_trend},
            "timeRange": range,
        }
    except Exception as error:  # noqa: BLE001
        logger.error(f"KPI fetch error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch KPIs")


@router.get("/launch-momentum")
async def launch_momentum():
    try:
        # patents has no competitor_name column; the filing company is `filer`.
        data = await db.query_many(
            """SELECT filer AS competitor_name, COUNT(*)::int AS filing_count, DATE_TRUNC('month', filing_date)::date AS month
                 FROM patents
                WHERE filer IS NOT NULL AND filing_date IS NOT NULL
                GROUP BY filer, DATE_TRUNC('month', filing_date)
                ORDER BY month DESC
                LIMIT 500"""
        )
        return {"data": data}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Launch momentum error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch launch momentum")


@router.get("/news-flow")
async def news_flow(granularity: str | None = None, months: int | None = None):
    try:
        if granularity == "month":
            months_clamped = clamp_int(months, 6, 1, 24)
            data = await db.query_many(
                """SELECT category, COUNT(*)::int AS count, DATE_TRUNC('month', published_date)::date AS month
                     FROM news
                    WHERE published_date >= DATE_TRUNC('month', NOW()) - ($1::int - 1) * INTERVAL '1 month'
                    GROUP BY category, DATE_TRUNC('month', published_date)
                    ORDER BY month ASC""",
                [months_clamped],
            )
            return {"data": data, "granularity": "month", "months": months_clamped}

        data = await db.query_many(
            """SELECT category, COUNT(*)::int AS count, DATE_TRUNC('week', published_date)::date AS week
                 FROM news
                WHERE published_date > NOW() - INTERVAL '90 days'
                GROUP BY category, DATE_TRUNC('week', published_date)
                ORDER BY week ASC"""
        )
        return {"data": data}
    except Exception as error:  # noqa: BLE001
        logger.error(f"News flow error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch news flow")


@router.get("/competitor-matrix")
async def competitor_matrix():
    try:
        data = await db.query_many(
            """SELECT competitor_name, category, COUNT(*) as claim_count
                 FROM (
                   SELECT DISTINCT p.filer as competitor_name, pc.category
                     FROM patents p
                     JOIN product_claims pc ON p.id = pc.patent_id
                 ) t
                GROUP BY competitor_name, category"""
        )
        return {"data": data}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Competitor matrix error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch competitor matrix")


@router.get("/top-movers")
async def top_movers():
    try:
        data = await db.query_many(
            "SELECT name, threat_score, recent_filings_count FROM competitors ORDER BY threat_score DESC LIMIT 10"
        )
        return {"data": data}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Top movers error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch top movers")


@router.get("/alerts")
async def alerts(user: AuthUser = Depends(get_current_user)):
    try:
        data = await db.query_many(
            """SELECT id, title, message, severity, created_at, source_module
                 FROM alerts
                WHERE user_id = $1 OR user_id IS NULL
                ORDER BY created_at DESC
                LIMIT 20""",
            [user.id],
        )
        return {"alerts": data}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Alerts fetch error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch alerts")
