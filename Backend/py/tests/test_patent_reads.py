from app.services.patent_reads import normalize_reads, read_schema

ROWS = [
    {"id": 0, "number": "US-11234567-B2", "title": "a"},
    {"id": 1, "number": "WO2021123456", "title": "b"},
    {"id": 2, "number": "IN202141012345A", "title": "c"},
]
CATS = ["Liquid Vaporizer", "Mosquito Coil"]
ATTRS = ["Active ingredient"]


def item(**kw):
    base = {"relevance": "High", "relevance_reason": "r", "summary": "s", "category": "Other", "attributes": {}}
    return {**base, **kw}


def test_clean_answer_passes_through_in_input_order():
    parsed = {"results": [item(id=2, number="IN202141012345A"), item(id=0, number="US-11234567-B2"), item(id=1, number="WO2021123456")]}
    results, missing = normalize_reads(parsed, ROWS, CATS, ATTRS)
    assert [r["id"] for r in results] == [0, 1, 2]
    assert missing == []


def test_dropped_record_is_reported_missing():
    results, missing = normalize_reads({"results": [item(id=0), item(id=2)]}, ROWS, CATS, ATTRS)
    assert [r["id"] for r in results] == [0, 2]
    assert missing == [1]


def test_matches_by_number_and_keeps_the_rows_own_number():
    parsed = {"results": [item(id="x", number="us 11234567 b2")]}
    results, missing = normalize_reads(parsed, ROWS, CATS, ATTRS)
    assert results[0]["id"] == 0 and results[0]["number"] == "US-11234567-B2"
    assert missing == [1, 2]


def test_invented_number_and_id_do_not_attach_to_a_row():
    results, missing = normalize_reads({"results": [item(id=99, number="US999")]}, ROWS, CATS, ATTRS)
    assert results == [] and missing == [0, 1, 2]


def test_falls_back_to_position_when_counts_match():
    parsed = [item(id=None, number=""), item(id=None, number=""), item(id=None, number="")]
    results, missing = normalize_reads(parsed, ROWS, CATS, ATTRS)
    assert [r["number"] for r in results] == [r["number"] for r in ROWS] and missing == []


def test_relevance_category_and_attributes_are_cut_to_allowed_values():
    parsed = {"results": [
        item(id=0, relevance="high", category="liquid vaporizer", attributes={"active ingredient": "Transfluthrin", "extra": "x"}),
        item(id=1, relevance="Moderate", category="Aerosol spray", attributes={}),
        item(id=2, relevance="Very relevant"),
    ]}
    results, missing = normalize_reads(parsed, ROWS, CATS, ATTRS)
    a, b = results
    assert (a["relevance"], a["category"], a["attributes"]) == ("High", "Liquid Vaporizer", {"Active ingredient": "Transfluthrin"})
    assert (b["relevance"], b["category"], b["attributes"]) == ("Medium", "Other", {"Active ingredient": "Not specified"})
    assert missing == [2]


def test_duplicate_results_for_one_row_keep_the_first():
    results, _ = normalize_reads({"results": [item(id=0, summary="first"), item(id=0, summary="second")]}, ROWS, CATS, ATTRS)
    assert len(results) == 1 and results[0]["summary"] == "first"


def test_garbage_is_all_missing():
    assert normalize_reads("nope", ROWS, CATS, ATTRS) == ([], [0, 1, 2])
    assert normalize_reads({"results": ["x", None]}, ROWS, CATS, ATTRS)[1] == [0, 1, 2]


def test_schema_limits_category_and_relevance():
    s = read_schema(CATS, ATTRS)["properties"]["results"]["items"]["properties"]
    assert s["category"]["enum"] == [*CATS, "Other"]
    assert s["relevance"]["enum"] == ["High", "Medium", "Low"]
    assert s["attributes"]["required"] == ATTRS
