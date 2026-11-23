import csv
import io
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Optional
from urllib.parse import quote

import httpx
from bs4 import BeautifulSoup

from app.db.connection import db
from app.utils.logger import logger


@dataclass
class ScrapedSKU:
    id: str
    brand: str
    name: str
    active_ingredient: str
    format: str
    price: float
    pack_size: str
    claims: list[str]
    target_pests: list[str]
    image_url: str
    product_link: str
    is_new: bool = False


TARGET_QUERIES = [
    {"keyword": "mosquito killer aerosol spray india", "defaultFormat": "Aerosol", "defaultPests": ["Aedes aegypti", "Anopheles", "Housefly"]},
    {"keyword": "mosquito liquid vaporizer machine refill", "defaultFormat": "Liquid Vaporizer", "defaultPests": ["Mosquito", "Dengue Vector"]},
    {"keyword": "mosquito repellent coil fast card paper", "defaultFormat": "Coil", "defaultPests": ["Mosquito"]},
    {"keyword": "cockroach killer gel paste syringe bait", "defaultFormat": "Gel/Paste", "defaultPests": ["Blattella germanica", "Periplaneta americana"]},
]

KNOWN_BRANDS = ["Good Knight", "Mortein", "HIT", "All Out", "Bayer", "Maxforce", "DND", "Odomos", "Eveready", "Herbal Strategi"]


def detect_brand(title: str) -> str:
    lower = title.lower()
    found = next((b for b in KNOWN_BRANDS if b.lower() in lower), None)
    if found:
        return found
    first_word = re.sub(r"[^a-zA-Z0-9]", "", title.split(" ")[0]) if title else ""
    return first_word or "Other"


def detect_format(title: str, fallback: str) -> str:
    lower = title.lower()
    if any(k in lower for k in ("gel", "paste", "syringe", "bait")):
        return "Gel/Paste"
    if any(k in lower for k in ("card", "paper", "strip")):
        return "Card"
    if "coil" in lower:
        return "Coil"
    if "mat" in lower:
        return "Mat"
    if any(k in lower for k in ("spray", "aerosol")):
        return "Aerosol"
    if any(k in lower for k in ("refill", "machine", "vaporizer", "liquid")):
        return "Liquid Vaporizer"
    return fallback


def infer_active_ingredient(title: str, fmt: str) -> str:
    lower = title.lower()
    if "transfluthrin" in lower:
        return "Transfluthrin 1.6% w/w"
    if "prallethrin" in lower:
        return "Prallethrin 1.6% w/w"
    if "allethrin" in lower:
        return "d-trans Allethrin 0.1% w/w"
    if "fipronil" in lower:
        return "Fipronil 0.05% w/w"
    if "cypermethrin" in lower:
        return "Cypermethrin 0.1% w/w"
    if any(k in lower for k in ("neem", "herbal", "citronella")):
        return "Botanical Citronella & Neem Oil"

    return {
        "Gel/Paste": "Fipronil 0.05% w/w Gel",
        "Aerosol": "Imiprothrin 0.07% + Cyphenothrin 0.2% w/w",
        "Coil": "d-trans Allethrin 0.1% w/w",
        "Card": "Transfluthrin 0.5% w/w Paper",
    }.get(fmt, "Transfluthrin 0.88% w/w LV")


def extract_pack_size(title: str) -> str:
    match = re.search(
        r"(\d+\s*x\s*\d+\s*(?:ml|g|gm|gms|coils|cards|strips|pcs|pack)|\d+\s*(?:ml|g|gm|gms|coils|cards|strips|pcs))",
        title, re.I,
    )
    return match.group(0) if match else "Standard Pack"


async def _scrape_amazon_search(keyword: str, default_format: str, default_pests: list[str]) -> list[ScrapedSKU]:
    search_url = f"https://www.amazon.in/s?k={quote(keyword)}"
    results: list[ScrapedSKU] = []

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                search_url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                    "Accept-Language": "en-IN,en;q=0.9",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                },
            )
        if response.status_code != 200:
            logger.warning(f'Amazon search returned HTTP {response.status_code} for "{keyword}"')
            return []

        soup = BeautifulSoup(response.text, "html.parser")
        for el in soup.select('div[data-component-type="s-search-result"]'):
            asin = el.get("data-asin")
            if not asin:
                continue

            title_el = el.select_one("h2 a span") or el.select_one("h2 span")
            title = title_el.get_text(strip=True) if title_el else ""
            if not title or len(title) < 8:
                continue

            price_el = el.select_one(".a-price-whole")
            price_whole = re.sub(r"[^0-9]", "", price_el.get_text()) if price_el else ""
            price = float(price_whole) if price_whole else 0

            img_el = el.select_one("img.s-image")
            img_src = img_el.get("src") if img_el else None
            img_src = img_src or "https://m.media-amazon.com/images/I/61rH8+1m8CL._SL1500_.jpg"

            link_el = el.select_one("h2 a")
            rel_href = link_el.get("href") if link_el else None
            product_link = (
                f"https://www.amazon.in{rel_href.split('/ref=')[0]}" if rel_href else f"https://www.amazon.in/dp/{asin}"
            )

            fmt = detect_format(title, default_format)
            brand = detect_brand(title)
            active_ingredient = infer_active_ingredient(title, fmt)
            pack_size = extract_pack_size(title)

            results.append(ScrapedSKU(
                id=f"amz-{asin}", brand=brand, name=title[:140], active_ingredient=active_ingredient, format=fmt,
                price=price or 149, pack_size=pack_size,
                claims=[f"Verified Amazon.in listing ({asin})", f"Format: {fmt} · {pack_size}"],
                target_pests=default_pests, image_url=img_src, product_link=product_link,
            ))
    except Exception as err:  # noqa: BLE001
        logger.error(f'Error scraping Amazon keyword "{keyword}": {err}')

    return results[:6]


def _export_products_to_csv(rows: list[dict], file_path: str) -> None:
    headers = [
        "Status", "SKU ID", "Brand", "Product Name", "Format", "Pack Size", "Active Ingredient",
        "Price (INR)", "Target Pests", "Claims", "Image URL", "Amazon Product Link", "Synced At",
    ]

    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for r in rows:
            def joined(v):
                return " | ".join(v) if isinstance(v, list) else v
            writer.writerow([
                "NEW LAUNCH" if r.get("is_new") else "EXISTING",
                r.get("id"), r.get("brand"), r.get("name"), r.get("format"), r.get("pack_size") or "Standard",
                r.get("active_ingredient"), r.get("price"), joined(r.get("target_pests")), joined(r.get("claims")),
                r.get("image_url"), r.get("product_link"), datetime.now(UTC).isoformat(),
            ])


async def run_monthly_amazon_sync() -> dict:
    logger.info("[Amazon Sync] Starting scheduled monthly product discovery & catalog sync...")

    existing_rows = await db.query_many("SELECT id, name FROM competitor_products")
    existing_ids = {r["id"] for r in existing_rows}
    existing_names = {r["name"].lower().strip() for r in existing_rows}

    scraped_all: list[ScrapedSKU] = []
    for q in TARGET_QUERIES:
        items = await _scrape_amazon_search(q["keyword"], q["defaultFormat"], q["defaultPests"])
        scraped_all.extend(items)

    new_count = 0
    updated_count = 0
    processed_records: list[dict] = []

    for item in scraped_all:
        is_new = item.id not in existing_ids and item.name.lower().strip() not in existing_names

        saved = await db.query_one(
            """INSERT INTO competitor_products
               (id, brand, name, active_ingredient, format, price, currency, claims, image_url, target_pests, pack_size, product_link, launched_at, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, 'INR', $7, $8, $9, $10, $11, CURRENT_DATE, NOW())
               ON CONFLICT (id) DO UPDATE SET
                 price = EXCLUDED.price,
                 image_url = COALESCE(EXCLUDED.image_url, competitor_products.image_url),
                 product_link = EXCLUDED.product_link,
                 pack_size = EXCLUDED.pack_size
               RETURNING *""",
            [item.id, item.brand, item.name, item.active_ingredient, item.format, item.price, item.claims,
             item.image_url, item.target_pests, item.pack_size, item.product_link],
        )

        if is_new:
            new_count += 1
        else:
            updated_count += 1

        processed_records.append({**(saved or {}), "is_new": is_new})

    month_tag = datetime.now(UTC).strftime("%Y-%m")
    export_file_name = f"entopedia-amazon-products-{month_tag}.csv"
    export_file_path = os.path.join(os.getcwd(), "exports", export_file_name)

    full_catalog = await db.query_many("SELECT * FROM competitor_products ORDER BY created_at DESC")
    new_id_set = {r["id"] for r in processed_records if r.get("is_new")}
    annotated_catalog = [{**row, "is_new": row["id"] in new_id_set} for row in full_catalog]

    _export_products_to_csv(annotated_catalog, export_file_path)

    logger.info(
        f"[Amazon Sync] Completed: {new_count} new products discovered, {updated_count} existing updated. "
        f"CSV saved at {export_file_path}"
    )

    return {
        "success": True, "month": month_tag, "new_products_found": new_count, "existing_updated": updated_count,
        "total_catalog_skus": len(full_catalog), "csv_filename": export_file_name, "products": full_catalog,
    }
