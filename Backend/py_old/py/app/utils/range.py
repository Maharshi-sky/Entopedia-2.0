"""
Turns a UI range such as "7d", "30d", "12w", "6m", "1y" or "ytd" into a
Postgres interval string ("30 days"). Used with $1::text::interval, because
Postgres does not accept a bind parameter after the INTERVAL keyword
(NOW() - INTERVAL $1 is a syntax error).
"""
import re
from datetime import datetime, date
from typing import Any

_UNITS = {"d": "days", "w": "weeks", "m": "months", "y": "years"}
_RANGE_RE = re.compile(r"^(\d{1,4})\s*([dwmy])$")


def to_interval(value: Any, fallback: str = "30 days") -> str:
    if not isinstance(value, str):
        return fallback
    v = value.strip().lower()
    if v == "ytd":
        now = datetime.now()
        start = date(now.year, 1, 1)
        days = max(1, (now.date() - start).days)
        return f"{days} days"
    m = _RANGE_RE.match(v)
    if not m:
        return fallback
    return f"{int(m.group(1))} {_UNITS[m.group(2)]}"


def clamp_int(value: Any, fallback: int, minimum: int, maximum: int) -> int:
    try:
        n = int(str(value if value is not None else ""))
    except (ValueError, TypeError):
        return fallback
    return min(maximum, max(minimum, n))
