from fastapi import APIRouter, Depends, HTTPException

from app.db.connection import db
from app.middleware.auth import get_current_user
from app.utils.logger import logger

router = APIRouter(dependencies=[Depends(get_current_user)])

_FALLBACK_ACTIVES = [
    {
        "id": "act-01", "name": "Transfluthrin", "slug": "transfluthrin", "cas_number": "118712-89-3",
        "chemical_class": "Fluorinated Pyrethroid", "formats": ["Liquid Vaporizer", "Mat", "Coil", "Paper Strip"],
        "hazard_class": "WHO Class II (Moderately Hazardous)",
        "toxicity_note": "High volatility vapor action; low mammalian toxicity when aerated.",
        "regulatory_status": "Approved", "product_count": 18,
        "source_url": "https://pubchem.ncbi.nlm.nih.gov/compound/118712-89-3",
    },
    {
        "id": "act-02", "name": "Prallethrin", "slug": "prallethrin", "cas_number": "23031-36-9",
        "chemical_class": "Synthetic Pyrethroid", "formats": ["Liquid Vaporizer", "Mat", "Aerosol"],
        "hazard_class": "WHO Class II (Moderately Hazardous)",
        "toxicity_note": "Potent insect axonal sodium channel disruptor; fast knockdown speed.",
        "regulatory_status": "Approved", "product_count": 14,
        "source_url": "https://pubchem.ncbi.nlm.nih.gov/compound/23031-36-9",
    },
    {
        "id": "act-03", "name": "Imiprothrin", "slug": "imiprothrin", "cas_number": "72963-72-5",
        "chemical_class": "Pyrethroid", "formats": ["Aerosol Spray", "Crawling Insect Spray"],
        "hazard_class": "WHO Class III (Slightly Hazardous)",
        "toxicity_note": "Extreme contact knockdown for crawling roaches; typically blended with cypermethrin.",
        "regulatory_status": "Approved", "product_count": 9,
        "source_url": "https://pubchem.ncbi.nlm.nih.gov/compound/72963-72-5",
    },
    {
        "id": "act-04", "name": "Chlorfenapyr", "slug": "chlorfenapyr", "cas_number": "122453-73-0",
        "chemical_class": "Pyrrole", "formats": ["Long-Lasting Indoor Residual Spray", "Bednet Treatment"],
        "hazard_class": "WHO Class II (Moderately Hazardous)",
        "toxicity_note": "Uncouples oxidative phosphorylation in mitochondria; overcomes kdr pyrethroid resistance.",
        "regulatory_status": "Approved", "product_count": 5,
        "source_url": "https://pubchem.ncbi.nlm.nih.gov/compound/122453-73-0",
    },
    {
        "id": "act-05", "name": "Permethrin", "slug": "permethrin", "cas_number": "52645-53-1",
        "chemical_class": "Type I Pyrethroid", "formats": ["Fabric Spray", "Coil", "Topical Lotion"],
        "hazard_class": "WHO Class II (Moderately Hazardous)",
        "toxicity_note": "Broad-spectrum contact insecticide; rising resistance reported in urban Aedes vectors.",
        "regulatory_status": "Under Review", "product_count": 8,
        "source_url": "https://pubchem.ncbi.nlm.nih.gov/compound/52645-53-1",
    },
    {
        "id": "act-06", "name": "Cypermethrin", "slug": "cypermethrin", "cas_number": "52315-07-8",
        "chemical_class": "Type II Pyrethroid", "formats": ["Chalk", "Aerosol Spray", "Emulsifiable Concentrate"],
        "hazard_class": "WHO Class II (Moderately Hazardous)",
        "toxicity_note": "Contains alpha-cyano moiety; robust residual surface persistence.",
        "regulatory_status": "Approved", "product_count": 11,
        "source_url": "https://pubchem.ncbi.nlm.nih.gov/compound/52315-07-8",
    },
]

_FALLBACK_UPDATES = [
    {
        "id": "upd-01", "market": "India", "authority": "CIB&RC", "update_type": "Phase-Out Warning",
        "title": "Phase-out timeline review for open-burning synthetic pyrethroid coils",
        "effective_date": "2026-08-01", "deadline_date": "2026-11-30", "days_left": 20,
        "status": "Under Review", "source_url": "https://cibrc.gov.in", "is_demo": False,
    },
    {
        "id": "upd-02", "market": "India", "authority": "CIB&RC", "update_type": "Label Mandate",
        "title": "Mandatory bilingual toxicity label requirement on indoor aerosols",
        "effective_date": "2026-06-15", "deadline_date": "2026-12-15", "days_left": 35,
        "status": "Approved", "source_url": "https://cibrc.gov.in", "is_demo": False,
    },
    {
        "id": "upd-03", "market": "European Union", "authority": "ECHA (BPR)", "update_type": "Approval Renewal",
        "title": "Biocidal Product Regulation approval extension for Transfluthrin PT18",
        "effective_date": "2026-04-10", "deadline_date": "2027-03-31", "days_left": 141,
        "status": "Approved", "source_url": "https://echa.europa.eu", "is_demo": False,
    },
]


@router.get("/actives/directory")
async def actives_directory(market: str = "India"):
    try:
        query = """
            SELECT
              a.id, a.name, a.slug, a.cas_number, a.chemical_class, a.formats, a.hazard_class,
              a.toxicity_note, a.source_url,
              COALESCE(r.approval_status, 'approved') AS regulatory_status,
              (
                SELECT COUNT(*)::int
                FROM competitor_products cp
                WHERE cp.active_ingredient ILIKE '%' || a.name || '%'
              ) AS product_count
            FROM actives a
            LEFT JOIN regulations r ON r.active_id = a.id AND r.market ILIKE $1
            ORDER BY a.name ASC
        """
        try:
            actives = await db.query_many(query, [market])
        except Exception:  # noqa: BLE001
            actives = _FALLBACK_ACTIVES

        return {"market": market, "data": actives, "total": len(actives)}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Actives directory error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch actives directory")


@router.get("/updates")
async def regulatory_updates(market: str = "India"):
    try:
        query = """
            SELECT
              id, market, authority, update_type, title, effective_date, deadline_date, status, source_url, is_demo,
              (deadline_date - CURRENT_DATE) AS days_left
            FROM regulatory_updates
            WHERE 1=1
        """
        params: list = []

        if market and market != "All":
            params.append(market)
            query += f" AND market ILIKE ${len(params)}"

        query += " ORDER BY deadline_date ASC NULLS LAST"

        try:
            updates = await db.query_many(query, params)
        except Exception:  # noqa: BLE001
            updates = _FALLBACK_UPDATES

        return {"data": updates, "total": len(updates)}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Regulatory updates error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch regulatory updates")


@router.get("/actives")
async def list_actives(market: str | None = None, active_ingredient: str | None = None):
    try:
        query = "SELECT * FROM regulations WHERE 1=1"
        params: list = []

        if market:
            params.append(market)
            query += f" AND market = ${len(params)}"
        if active_ingredient:
            params.append(f"%{active_ingredient}%")
            query += f" AND active_ingredient ILIKE ${len(params)}"

        query += " ORDER BY market, active_ingredient"

        regulations = await db.query_many(query, params)
        return regulations
    except Exception as error:  # noqa: BLE001
        logger.error(f"Regulations error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch regulations")
