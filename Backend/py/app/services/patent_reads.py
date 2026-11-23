"""Checks what the model returns for a Patent Analyser read before it reaches the user.

The model is asked for one result per record, but a 7B model sometimes drops a record, reorders them,
invents a publication number, answers "high" or "Very relevant", or names a category that was never
offered. Each result is matched back to an input row (by id, then by number, then by position when the
counts line up), the row's own id and number are kept, and fields are cut to the allowed values.
Rows with no usable result are reported as missing so the caller can ask again.
"""

from __future__ import annotations

import json
import re
from typing import Any

RELEVANCE = {"high": "High", "medium": "Medium", "med": "Medium", "moderate": "Medium", "low": "Low"}
NOT_SPECIFIED = "Not specified"


def _text(value: Any, limit: int) -> str:
    if value is None or isinstance(value, (dict, list)):
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()[:limit]


def _number_key(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def read_prompts(brief: str, rows: list[dict], categories: list[str], attributes: list[str]) -> tuple[str, str]:
    """(system, user) prompts for one batch.

    On a CPU most of the time goes on the tokens the model writes, so the answer is kept short: no
    publication number echoed back (the row's own is used), one-sentence summary, a brief reason.
    """
    category_rule = f"one of {json.dumps(categories)} or \"Other\"" if categories else '"Other"'
    attribute_rule = (
        f"an object with exactly these keys {json.dumps(attributes)}, each a short repeatable class label "
        '(2-4 words, the same wording across records) or "Not specified"'
        if attributes
        else "{}"
    )
    system = f"""You are a patent analyst for household insecticide and pest-control R&D.
Judge each patent record against the user's Analysis Brief.
Return JSON {{"results": [...]}} with one object per input record, in the same order. Keep the text short.
- "id": the record's id, unchanged
- "relevance": "High", "Medium" or "Low" against the brief
- "category": {category_rule}
- "attributes": {attribute_rule}
- "relevance_reason": why, in at most 15 words
- "summary": one sentence of at most 30 words: active ingredient, format and claimed improvement"""
    records = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    user = f'Analysis Brief: "{brief.strip()}"\n\nPatent records ({len(rows)}):\n{records}'
    return system, user


def read_schema(categories: list[str], attributes: list[str]) -> dict:
    """JSON schema for structured output, so most answers arrive in shape already.

    Field order matters: the short judgement fields come before the free text.
    """
    item: dict[str, Any] = {
        "type": "object",
        "properties": {
            "id": {"type": "integer"},
            "relevance": {"type": "string", "enum": ["High", "Medium", "Low"]},
            "category": {"type": "string", "enum": [*categories, "Other"]},
            "attributes": {
                "type": "object",
                "properties": {a: {"type": "string"} for a in attributes},
                "required": list(attributes),
            },
            "relevance_reason": {"type": "string"},
            "summary": {"type": "string"},
        },
        "required": ["id", "relevance", "category", "attributes", "relevance_reason", "summary"],
    }
    return {
        "type": "object",
        "properties": {"results": {"type": "array", "items": item}},
        "required": ["results"],
    }


def normalize_reads(
    parsed: Any, rows: list[dict], categories: list[str], attributes: list[str]
) -> tuple[list[dict], list[Any]]:
    """Returns (results in input order, ids of rows with no usable result)."""
    if isinstance(parsed, dict):
        items = parsed.get("results")
    else:
        items = parsed
    if not isinstance(items, list):
        items = []

    by_id = {str(r["id"]): r for r in rows}
    by_number = {_number_key(r["number"]): r for r in rows if _number_key(r["number"])}
    category_of = {c.strip().lower(): c for c in categories}
    out: dict[str, dict] = {}

    for pos, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        row = by_id.get(str(item.get("id"))) or by_number.get(_number_key(item.get("number")))
        if row is None and len(items) == len(rows):
            row = rows[pos]
        if row is None or str(row["id"]) in out:
            continue

        relevance = RELEVANCE.get(_text(item.get("relevance"), 20).lower())
        if relevance is None:
            continue  # no usable judgement: treat the row as missing

        raw_attrs = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}
        attr_of = {str(k).strip().lower(): v for k, v in raw_attrs.items()}
        out[str(row["id"])] = {
            "id": row["id"],
            "number": row["number"],
            "relevance": relevance,
            "relevance_reason": _text(item.get("relevance_reason"), 400),
            "summary": _text(item.get("summary"), 700),
            "category": category_of.get(_text(item.get("category"), 120).lower(), "Other"),
            "attributes": {a: _text(attr_of.get(a.strip().lower()), 80) or NOT_SPECIFIED for a in attributes},
        }

    results = [out[str(r["id"])] for r in rows if str(r["id"]) in out]
    missing = [r["id"] for r in rows if str(r["id"]) not in out]
    return results, missing
