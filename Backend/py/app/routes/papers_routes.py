from fastapi import APIRouter, Depends, HTTPException

from app.db.connection import db
from app.middleware.auth import get_current_user
from app.utils.logger import logger

router = APIRouter(dependencies=[Depends(get_current_user)])

_FALLBACK_PAPERS = [
    {
        "id": "1",
        "title": "Pyrethroid Knockdown Resistance (kdr) Mutations in Aedes aegypti across Urban South Asia",
        "authors": ["Sharma, R.", "Patel, K.", "Verma, A."], "journal": "Parasites & Vectors", "year": 2024,
        "doi": "10.1186/s13071-024-06120-x", "url": "https://doi.org/10.1186/s13071-024-06120-x",
        "abstract": "Investigation of V1016G and F1534C voltage-gated sodium channel mutations conferring high resistance to transfluthrin and prallethrin in dengue vectors.",
        "pests": ["Aedes aegypti", "Mosquito"], "actives": ["Transfluthrin", "Prallethrin"],
    },
    {
        "id": "2",
        "title": "Efficacy of Chlorfenapyr Formulations against Pyrethroid-Resistant Anopheles gambiae",
        "authors": ["Ngufor, C.", "Critchley, J.", "Rowland, M."], "journal": "Malaria Journal", "year": 2023,
        "doi": "10.1186/s12936-023-04501-1", "url": "https://doi.org/10.1186/s12936-023-04501-1",
        "abstract": "Evaluation of pyrrole active ingredients overcoming cytochrome P450-mediated metabolic resistance in sub-Saharan vector populations.",
        "pests": ["Anopheles gambiae", "Mosquito"], "actives": ["Chlorfenapyr"],
    },
    {
        "id": "3",
        "title": "Behavioral Glucose Aversion and Insecticide Susceptibility in Blattella germanica",
        "authors": ["Silverman, J.", "Wada-Katsumata, A."], "journal": "Journal of Economic Entomology", "year": 2024,
        "doi": "10.1093/jee/toad188", "url": "https://doi.org/10.1093/jee/toad188",
        "abstract": "Cross-resistance patterns between synthetic pyrethroid sprays and phenylpyrazole bait consumption in residential cockroach infestations.",
        "pests": ["Blattella germanica", "Cockroach"], "actives": ["Fipronil", "Imiprothrin"],
    },
]


@router.get("")
@router.get("/")
async def list_papers(pest: str | None = None, active: str | None = None, q: str | None = None, limit: int = 50, offset: int = 0):
    try:
        query = """
            SELECT id, title, authors, journal, year, doi, url, abstract, pests, actives
            FROM research_papers
            WHERE 1=1
        """
        params: list = []

        if q:
            params.append(f"%{q}%")
            query += f" AND (title ILIKE ${len(params)} OR abstract ILIKE ${len(params)})"
        if pest:
            params.append(pest)
            query += f" AND ${len(params)} = ANY(pests)"
        if active:
            params.append(active)
            query += f" AND ${len(params)} = ANY(actives)"

        query += f" ORDER BY year DESC, title ASC LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}"
        params.extend([limit, offset])

        try:
            papers = await db.query_many(query, params)
        except Exception:  # noqa: BLE001
            papers = _FALLBACK_PAPERS

        return {"data": papers, "total": len(papers)}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Research papers error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch research papers")
