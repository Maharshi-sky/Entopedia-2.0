import re
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException

from app.db.connection import db
from app.middleware.auth import AuthUser, get_current_user
from app.services.ollama_service import ollama_service
from app.utils.logger import logger

router = APIRouter(dependencies=[Depends(get_current_user)])

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


@router.get("/ai-status")
async def ai_status():
    return await ollama_service.get_status()


@router.get("/landscape")
async def patent_landscape(top: int = 8):
    try:
        landscape_query = """
            SELECT
              COALESCE(NULLIF(TRIM(filer), ''), 'Unknown') AS assignee,
              EXTRACT(YEAR FROM COALESCE(priority_date, filing_date))::int AS year,
              COUNT(*)::int AS filings
            FROM patents
            WHERE COALESCE(priority_date, filing_date) IS NOT NULL
            GROUP BY 1, 2
            ORDER BY 1, 2
        """
        top_assignees_query = """
            SELECT
              COALESCE(NULLIF(TRIM(filer), ''), 'Unknown') AS assignee,
              COUNT(*)::int AS total
            FROM patents
            GROUP BY 1
            ORDER BY total DESC
            LIMIT $1
        """

        rows = await db.query_many(landscape_query)
        top_assignees = await db.query_many(top_assignees_query, [top])

        allowed_set = {a["assignee"] for a in top_assignees}
        filtered_rows = [
            {"assignee": r["assignee"] if r["assignee"] in allowed_set else "Others", "year": r["year"], "filings": r["filings"]}
            for r in rows
        ]

        return {"top_assignees": top_assignees, "data": filtered_rows}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Patent landscape error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch patent landscape data")


@router.get("/white-space")
async def white_space():
    try:
        coverage_query = """
            SELECT
              TRIM(ai) AS active_ingredient,
              COALESCE(NULLIF(TRIM(format), ''), 'Other') AS format,
              COUNT(*)::int AS coverage
            FROM patents,
            LATERAL unnest(COALESCE(active_ingredients, ARRAY[]::text[])) AS ai
            WHERE TRIM(ai) <> ''
            GROUP BY 1, 2
            ORDER BY coverage DESC
        """
        coverage = await db.query_many(coverage_query)
        actives = list(dict.fromkeys(r["active_ingredient"] for r in coverage))
        formats = list(dict.fromkeys(r["format"] for r in coverage))

        return {"actives": actives, "formats": formats, "coverage": coverage}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Patent white-space error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch patent white-space matrix")


@router.post("/read-records")
async def read_records(body: dict = Body(...)):
    try:
        brief = body.get("brief")
        records = body.get("records", [])
        categories = body.get("categories", [])
        attributes = body.get("attributes", [])

        if not brief or not isinstance(brief, str) or not brief.strip():
            raise HTTPException(status_code=400, detail="Analysis brief is required")
        if not isinstance(records, list) or len(records) == 0:
            raise HTTPException(status_code=400, detail="At least one patent record is required")

        status = await ollama_service.get_status()
        if not status["available"]:
            raise HTTPException(status_code=503, detail=f"Local Ollama is not reachable at {status['host']}. Start Ollama on port 11434 and try again.")

        compact_rows = []
        for idx, r in enumerate(records[:25]):
            compact_rows.append({
                "id": r.get("id", idx),
                "number": str(r.get("number") or r.get("publication_number") or f"Row-{idx + 1}"),
                "title": str(r.get("title") or "")[:250],
                "abstract": str(r.get("abstract") or "")[:600],
                "assignee": str(r.get("assignee") or r.get("Filer") or ""),
                "date": str(r.get("date") or r.get("Priority year") or ""),
            })

        import json
        system_prompt = f"""You are a patent intelligence analyst for household insecticide & pest control R&D.
Evaluate each patent record strictly against the user's Analysis Brief.
Return ONLY a valid JSON object with a single key "results" containing an array of objects—one for each input record in the exact same order.

Each object in "results" MUST have:
- "id": exact id from input
- "number": exact publication number from input
- "relevance": "High" | "Medium" | "Low"
- "relevance_reason": 1 concise sentence explaining why it matches or misses the brief
- "summary": 2 concise technical sentences summarizing active ingredient, format, and claimed improvement
- "category": {f"pick the single best match from {json.dumps(categories)} or \"Other\"" if categories else '"Other"'}
- "attributes": an object mapping each requested attribute ({json.dumps(attributes)}) to a short, repeatable class label (or "Not specified")."""

        user_prompt = f"""Analysis Brief:
"{brief.strip()}"

Requested Technology Categories: {', '.join(categories) if categories else 'None'}
Requested Attributes to Extract: {', '.join(attributes) if attributes else 'None'}

Patent Records ({len(compact_rows)}):
{json.dumps(compact_rows, indent=2)}"""

        parsed = await ollama_service.chat_json(prompt=user_prompt, system=system_prompt, temperature=0.15, timeout_ms=300000)

        results = parsed.get("results") if isinstance(parsed, dict) and isinstance(parsed.get("results"), list) else []

        return {"success": True, "model": status["defaultModel"], "count": len(results), "results": results}
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(f"Patent read-records error: {error}")
        raise HTTPException(status_code=500, detail=str(error) or "Failed to read patent records with Ollama")


_PRESET_INSTRUCTIONS = {
    "Executive summary": "Write a crisp Executive Summary of this patent set: overall volume, dominant active ingredients, primary delivery formats, top assignees, and strategic takeaway. Cite publication numbers like [US10234567].",
    "Cross-cutting themes": "Identify 4-6 recurring technical or formulation themes across these filings (e.g., controlled release, low-smoke, resistance management, botanical actives). Group supporting patents under each theme with [Publication Number] citations.",
    "Filer profiles": "Profile the key assignees/filers in this dataset: compare their technical focus, preferred actives, formats, and filing timeline. Cite [Publication Number] for every claim.",
    "What changed recently": "Analyze temporal shifts across the priority/filing years in this set: what technologies, actives, or formats emerged in the most recent filings compared to earlier years? Cite [Publication Number].",
}


@router.post("/read-set")
async def read_set(body: dict = Body(...), user: AuthUser = Depends(get_current_user)):
    try:
        mode = body.get("mode", "preset")
        preset = body.get("preset")
        question = body.get("question")
        ask_mode = body.get("askMode", "Ask a question")
        brief = body.get("brief", "")
        records = body.get("records", [])

        if not isinstance(records, list) or len(records) == 0:
            raise HTTPException(status_code=400, detail="Patent records are required to read the set")

        status = await ollama_service.get_status()
        if not status["available"]:
            raise HTTPException(status_code=503, detail=f"Local Ollama is not reachable at {status['host']}. Start Ollama on port 11434 and try again.")

        truncated = len(records) > 150
        working_set = records[:150]

        context_lines = []
        for idx, r in enumerate(working_set):
            num = r.get("number") or r.get("publication_number") or f"Row-{idx + 1}"
            filer = r.get("Filer") or r.get("assignee") or "Unknown"
            year = r.get("Priority year") or r.get("date") or ""
            tech = r.get("Technology") or r.get("category") or ""
            rel = f" | Relevance: {r['relevance']}" if r.get("relevance") else ""
            desc = r.get("summary") or r.get("abstract") or r.get("title") or ""
            context_lines.append(f"[{num}] {filer} ({year}) [{tech}{rel}] — {r.get('title', '')}: {str(desc)[:320]}")

        if mode == "preset":
            selected_preset = str(preset or "Executive summary")
            task_prompt = _PRESET_INSTRUCTIONS.get(
                selected_preset, f'Provide a comprehensive "{selected_preset}" analysis of this patent set, citing [Publication Number] throughout.'
            )
            audit_question = f"[Patent Analyser · {selected_preset}] ({len(working_set)} records)"
        else:
            if not question or not str(question).strip():
                raise HTTPException(status_code=400, detail="Question is required")
            task_prompt = f'Mode: {ask_mode}\nUser Question: "{str(question).strip()}"\n\nAnswer directly using ONLY the patent records provided. Cite exact [Publication Number]s. Explicitly state what the dataset cannot answer rather than guessing.'
            audit_question = f"[Patent Analyser · {ask_mode}] {str(question).strip()}"

        system_prompt = """You are an expert patent intelligence analyst for Entopedia.
Rules:
1. Ground every statement strictly in the provided patent records.
2. Cite publication numbers in square brackets, e.g. [WO2021045678].
3. Never invent patents, assignees, or claims not present in the context.
4. If the dataset lacks evidence to answer part of the request, explicitly state what is missing.
5. Format clearly with concise headings and bullet points."""

        full_prompt = (
            (f"Active Analysis Brief: {brief}\n\n" if brief else "")
            + f"{task_prompt}\n\nPatent Dataset ({len(working_set)}"
            + (f" of {len(records)}, capped at 150" if truncated else "")
            + f" records):\n" + "\n".join(context_lines)
        )

        answer = await ollama_service.chat(prompt=full_prompt, system=system_prompt, temperature=0.25, timeout_ms=300000)

        try:
            await db.execute(
                """INSERT INTO ai_queries (id, user_id, modules, query_text, response, confidence_level, retrieved_vs_inferred, tokens_used, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())""",
                [str(uuid.uuid4()), user.id, ["patent-analyser"], audit_question, answer, "high", ["retrieved"], -(-len(answer) // 4)],
            )
        except Exception as log_err:  # noqa: BLE001
            logger.warning(f"Failed to log patent read-set query: {log_err}")

        return {"success": True, "model": status["defaultModel"], "records_analyzed": len(working_set), "truncated": truncated, "answer": answer}
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(f"Patent read-set error: {error}")
        raise HTTPException(status_code=500, detail=str(error) or "Failed to analyze patent set with Ollama")


@router.post("/upload-csv")
async def upload_csv(body: dict = Body(...)):
    try:
        patents = body.get("patents")
        if not isinstance(patents, list) or len(patents) == 0:
            raise HTTPException(status_code=400, detail="Array of patent records is required")

        inserted = 0
        updated = 0
        skipped: list[dict] = []

        for i, p in enumerate(patents):
            patent_number = str(p.get("patentNumber") or p.get("publication_number") or p.get("patent_number") or p.get("id") or "").strip()

            if not patent_number:
                skipped.append({"row": i + 1, "reason": "Missing patent publication number"})
                continue

            filer = str(p.get("assignee") or p.get("filer") or "Unknown Assignee").strip()
            title = str(p.get("title") or "Untitled Patent Application").strip()
            raw_date = p.get("filingDate") or p.get("filing_date")
            parsed_date = None
            if raw_date:
                try:
                    parsed_date = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
                except ValueError:
                    parsed_date = None
            fmt = str(p["format"]).strip() if p.get("format") else None
            ai_summary = p.get("ai_summary") or p.get("summary")
            abstract = p.get("abstract")
            relevance = p.get("relevance")
            threat_score = 0.9 if relevance == "High" else 0.6 if relevance == "Medium" else 0.3 if relevance == "Low" else None

            actives = p.get("activeIngredient") or p.get("active_ingredients") or []
            actives_list = actives if isinstance(actives, list) else re.split(r"[,;|]", str(actives))
            actives_array = [s.strip() for s in actives_list if s and s.strip()]

            try:
                result = await db.query_one(
                    """INSERT INTO patents (
                         id, patent_number, publication_number, filer, title, filing_date,
                         active_ingredients, format, abstract, ai_summary, threat_score, created_at
                       ) VALUES (
                         gen_random_uuid(), $1, $1, $2, $3, $4,
                         $5::text[], COALESCE($6, 'Other'), $7, $8, $9, NOW()
                       )
                       ON CONFLICT (publication_number) DO UPDATE SET
                         filer = EXCLUDED.filer,
                         title = EXCLUDED.title,
                         filing_date = COALESCE(EXCLUDED.filing_date, patents.filing_date),
                         active_ingredients = CASE
                           WHEN array_length(EXCLUDED.active_ingredients, 1) > 0 THEN EXCLUDED.active_ingredients
                           ELSE patents.active_ingredients
                         END,
                         format = COALESCE(NULLIF(EXCLUDED.format, 'Other'), patents.format),
                         abstract = COALESCE(EXCLUDED.abstract, patents.abstract),
                         ai_summary = COALESCE(EXCLUDED.ai_summary, patents.ai_summary),
                         threat_score = COALESCE(EXCLUDED.threat_score, patents.threat_score)
                       RETURNING (xmax = 0) AS is_insert""",
                    [patent_number, filer, title, parsed_date, actives_array, fmt, abstract, ai_summary, threat_score],
                )

                if result and result.get("is_insert"):
                    inserted += 1
                else:
                    updated += 1
            except Exception as err:  # noqa: BLE001
                skipped.append({"row": i + 1, "reason": str(err)})

        return {"success": True, "inserted": inserted, "updated": updated, "skipped": skipped, "total_processed": len(patents)}
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(f"Patent batch save error: {error}")
        raise HTTPException(status_code=500, detail="Failed to save patents")


@router.get("")
@router.get("/")
async def list_patents(filer: str | None = None, active: str | None = None, target_pest: str | None = None, limit: int = 20, offset: int = 0):
    try:
        query = "SELECT * FROM patents WHERE 1=1"
        params: list[Any] = []

        if filer:
            params.append(f"%{filer}%")
            query += f" AND filer ILIKE ${len(params)}"
        if active:
            params.append([active])
            query += f" AND active_ingredients @> ${len(params)}::text[]"
        if target_pest:
            params.append([target_pest])
            query += f" AND target_pests @> ${len(params)}::text[]"

        query += f" ORDER BY filing_date DESC NULLS LAST LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}"
        params.extend([limit, offset])

        patents = await db.query_many(query, params)
        total = await db.query_one("SELECT COUNT(*) as count FROM patents")

        return {"data": patents, "pagination": {"limit": limit, "offset": offset, "total": total["count"] if total else 0}}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Patent list error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch patents")


@router.get("/{patent_id}")
async def patent_detail(patent_id: str):
    try:
        if not UUID_RE.match(patent_id):
            raise HTTPException(status_code=400, detail="Invalid patent UUID format")

        patent = await db.query_one("SELECT * FROM patents WHERE id = $1", [patent_id])
        if not patent:
            raise HTTPException(status_code=404, detail="Patent not found")

        return patent
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(f"Patent detail error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch patent")
