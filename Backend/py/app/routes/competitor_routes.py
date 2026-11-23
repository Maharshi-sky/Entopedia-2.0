import re

from fastapi import APIRouter, Body, Depends, HTTPException

from app.db.connection import db
from app.middleware.auth import get_current_user
from app.utils.logger import logger

router = APIRouter()

# =========================================================================
# PUBLIC PRODUCT LIBRARY ROUTES (Accessible via /api/competitor/products)
# =========================================================================


@router.get("/products")
async def list_products(brand: str | None = None, format: str | None = None, active_id: str | None = None):
    try:
        query = "SELECT * FROM competitor_products WHERE 1=1"
        params: list = []

        if brand:
            params.append(brand)
            query += f" AND brand ILIKE ${len(params)}"
        if format:
            params.append(format)
            query += f" AND format ILIKE ${len(params)}"
        if active_id:
            params.append(active_id)
            query += f" AND active_ingredient ILIKE ${len(params)}"

        query += " ORDER BY created_at DESC"

        products = await db.query_many(query, params)
        return products
    except Exception as error:  # noqa: BLE001
        logger.error(f"Error fetching competitor products: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch competitor products")


@router.post("/products", status_code=201)
async def create_product(body: dict = Body(...)):
    try:
        brand = body.get("brand")
        name = body.get("name")
        if not brand or not name:
            raise HTTPException(status_code=400, detail="Brand and product name are required")

        competitor_id = body.get("competitor_id")
        active_ingredient = body.get("active_ingredient", "")
        format_ = body.get("format", "LV")
        price = body.get("price", 0)
        currency = body.get("currency", "INR")
        claims = body.get("claims", [])
        image_url = body.get("image_url")
        target_pests = body.get("target_pests", [])
        pack_size = body.get("pack_size", "")
        product_link = body.get("product_link")

        new_product = await db.query_one(
            """INSERT INTO competitor_products
               (competitor_id, brand, name, active_ingredient, format, price, currency, claims, image_url, target_pests, pack_size, product_link, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
               RETURNING *""",
            [competitor_id, brand, name, active_ingredient, format_, price, currency, claims, image_url, target_pests, pack_size, product_link],
        )
        return new_product
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(f"Error creating competitor product: {error}")
        raise HTTPException(status_code=500, detail="Failed to create competitor product")


# =========================================================================
# PROTECTED COMPETITOR ROUTES (Require Auth Token)
# =========================================================================


@router.get("", dependencies=[Depends(get_current_user)])
@router.get("/", dependencies=[Depends(get_current_user)])
async def list_competitors(search: str | None = None, limit: int = 20, offset: int = 0):
    try:
        query = """
            SELECT
              c.*,
              (
                SELECT COUNT(*)::int
                FROM competitor_products cp
                LEFT JOIN brand_owners bo ON bo.brand = cp.brand
                WHERE bo.competitor_id = c.id
                   OR cp.competitor_id = c.id
                   OR cp.brand ILIKE '%' || c.name || '%'
              ) AS sku_count,
              (
                SELECT COUNT(*)::int
                FROM competitor_products cp
                LEFT JOIN brand_owners bo ON bo.brand = cp.brand
                WHERE (bo.competitor_id = c.id OR cp.competitor_id = c.id OR cp.brand ILIKE '%' || c.name || '%')
                  AND cp.created_at >= NOW() - INTERVAL '90 days'
              ) AS launch_count,
              (
                SELECT COUNT(*)::int
                FROM patents p
                WHERE p.filer ILIKE '%' || c.name || '%'
              ) AS patent_count,
              (
                SELECT COUNT(*)::int
                FROM patents p
                WHERE p.filer ILIKE '%' || c.name || '%'
                  AND p.filing_date > NOW() - INTERVAL '18 months'
              ) AS active_filing_count,
              (
                SELECT COUNT(DISTINCT cp.format)::int
                FROM competitor_products cp
                LEFT JOIN brand_owners bo ON bo.brand = cp.brand
                WHERE bo.competitor_id = c.id OR cp.competitor_id = c.id
              ) AS format_count
            FROM competitors c
        """
        params: list = []

        if search:
            params.append(f"%{search}%")
            query += f" WHERE c.name ILIKE ${len(params)}"

        query += f" ORDER BY c.threat_score DESC NULLS LAST LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}"
        params.extend([limit, offset])

        competitors = await db.query_many(query, params)
        total = await db.query_one(
            "SELECT COUNT(*) as count FROM competitors" + (" WHERE name ILIKE $1" if search else ""),
            [f"%{search}%"] if search else [],
        )

        return {"data": competitors, "pagination": {"limit": limit, "offset": offset, "total": total["count"] if total else 0}}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Competitor list error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch competitors")


@router.get("/{competitor_id}/summary", dependencies=[Depends(get_current_user)])
async def competitor_summary(competitor_id: str):
    try:
        competitor = await db.query_one("SELECT * FROM competitors WHERE id = $1", [competitor_id])
        if not competitor:
            raise HTTPException(status_code=404, detail="Competitor not found")

        breakdowns = await db.query_many(
            """SELECT
                 cp.brand,
                 cp.format,
                 COUNT(*)::int AS skus
               FROM competitor_products cp
               LEFT JOIN brand_owners bo ON bo.brand = cp.brand
               WHERE bo.competitor_id = $1
                  OR cp.competitor_id = $1
                  OR cp.brand ILIKE '%' || $2 || '%'
               GROUP BY cp.brand, cp.format
               ORDER BY skus DESC""",
            [competitor_id, competitor["name"]],
        )

        format_totals: dict[str, int] = {}
        total_skus = 0
        for row in breakdowns:
            format_totals[row["format"]] = format_totals.get(row["format"], 0) + row["skus"]
            total_skus += row["skus"]

        patents = await db.query_many(
            "SELECT id, title, publication_number, filing_date FROM patents WHERE filer ILIKE $1 ORDER BY filing_date DESC LIMIT 10",
            [f"%{competitor['name']}%"],
        )

        launches_90d = await db.query_one(
            """SELECT COUNT(*)::int AS count
               FROM competitor_products cp
               LEFT JOIN brand_owners bo ON bo.brand = cp.brand
               WHERE (bo.competitor_id = $1 OR cp.competitor_id = $1 OR cp.brand ILIKE '%' || $2 || '%')
                 AND cp.created_at >= NOW() - INTERVAL '90 days'""",
            [competitor_id, competitor["name"]],
        )

        return {
            "competitor_id": competitor["id"],
            "name": competitor["name"],
            "total_skus": total_skus,
            "launches_90d": launches_90d["count"] if launches_90d else 0,
            "format_split": format_totals,
            "brand_breakdown": breakdowns,
            "patents_count": len(patents),
            "recent_patents": patents,
        }
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(f"Competitor summary error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch competitor summary")


@router.get("/{competitor_id}", dependencies=[Depends(get_current_user)])
async def competitor_detail(competitor_id: str):
    try:
        competitor = await db.query_one("SELECT * FROM competitors WHERE id = $1", [competitor_id])
        if not competitor:
            raise HTTPException(status_code=404, detail="Competitor not found")

        products = await db.query_many(
            """SELECT DISTINCT name
               FROM competitor_products cp
               LEFT JOIN brand_owners bo ON bo.brand = cp.brand
               WHERE bo.competitor_id = $1 OR cp.competitor_id = $1 OR cp.brand ILIKE '%' || $2 || '%'""",
            [competitor["id"], competitor["name"]],
        )

        patents = await db.query_many(
            "SELECT * FROM patents WHERE filer ILIKE $1 ORDER BY filing_date DESC LIMIT 50", [f"%{competitor['name']}%"]
        )

        registrations = await db.query_many(
            """SELECT * FROM regulations
               WHERE active_ingredient IN (
                 SELECT DISTINCT active_ingredient FROM competitor_products WHERE brand ILIKE '%' || $1 || '%'
               )""",
            [competitor["name"]],
        )

        return {
            **competitor,
            "products": [p["name"] for p in products],
            "patents": len(patents),
            "recent_filings": patents[:5],
            "registrations": len(registrations),
        }
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(f"Competitor detail error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch competitor")


@router.post("/q-and-a", dependencies=[Depends(get_current_user)])
async def competitor_qa(body: dict = Body(...)):
    try:
        return {"question": body.get("question"), "answer": "AI answer will be generated here with sources", "sources": [], "confidence": "medium"}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Q&A error: {error}")
        raise HTTPException(status_code=500, detail="Failed to process question")
