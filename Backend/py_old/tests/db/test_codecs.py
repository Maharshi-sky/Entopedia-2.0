"""The asyncpg codecs that make the port behave like node-postgres (app/db/connection.py)."""
from datetime import UTC, date, datetime

from app.db.connection import _date_decode, _json_encode, _time_decode, _time_encode
from app.utils.range import to_interval


def test_json_strings_pass_through_and_objects_are_encoded():
    assert _json_encode('{"a": 1}') == '{"a": 1}'
    assert _json_encode({"a": 1}) == '{"a": 1}'
    assert _json_encode([{"brand": "HIT", "kind": "brand"}]) == '[{"brand": "HIT", "kind": "brand"}]'


def test_date_parameters_accept_iso_strings_and_objects():
    assert _time_encode("2026-11-05T08:00:00+00:00") == "2026-11-05T08:00:00+00:00"
    assert _time_encode(datetime(2026, 11, 5, 8, tzinfo=UTC)) == "2026-11-05T08:00:00+00:00"
    assert _time_encode(date(2024, 3, 15)) == "2024-03-15"


def test_timestamps_come_back_as_aware_datetimes():
    assert _time_decode("2026-11-19 10:42:17.955+00") == datetime(2026, 11, 19, 10, 42, 17, 955000, tzinfo=UTC)
    # a zone-less TIMESTAMP is UTC (the session runs in UTC), so the API sends "+00:00"
    assert _time_decode("2026-11-19 10:42:17.955").isoformat() == "2026-11-19T10:42:17.955000+00:00"
    assert _time_decode("infinity") == "infinity"
    assert _date_decode("2024-03-15") == date(2024, 3, 15)


def test_ui_ranges_become_interval_text():
    assert to_interval("7d") == "7 days"
    assert to_interval("6m") == "6 months"
    assert to_interval(None) == "30 days"
