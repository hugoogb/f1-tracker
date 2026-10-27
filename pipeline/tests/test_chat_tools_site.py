import json

from src.chat.constants import MAX_TOOL_RESULT_CHARS
from src.chat.tools import site  # noqa: F401 - registers
from src.chat.tools.registry import TOOLS, run_tool, tool_label, tool_specs


def test_every_spec_is_strict_mode_ready():
    for spec in tool_specs():
        schema = spec["input_schema"]
        assert schema["additionalProperties"] is False
        assert sorted(schema["required"]) == sorted(schema["properties"])
        assert "anyOf" not in json.dumps(schema)


def test_navigate_is_the_last_tool_so_the_cache_breakpoint_sits_on_it():
    assert tool_specs()[-1]["name"] == "navigate"


def test_search_returns_compact_rows_with_hrefs(db, seed_data):
    out = json.loads(run_tool(db, "search", {"q": "verstappen"}))
    assert out["drivers"] == [
        {
            "name": "Max Verstappen",
            "ref": "max_verstappen",
            "nationality": "Dutch",
            "href": "/drivers/max_verstappen",
        }
    ]
    assert len(json.dumps(out)) < MAX_TOOL_RESULT_CHARS


def test_site_map_covers_the_records_and_compare_pages(db):
    hrefs = {p["href"] for p in json.loads(run_tool(db, "site_map", {}))["pages"]}
    assert {
        "/",
        "/records",
        "/compare/drivers",
        "/seasons/{year}/races/{round}",
        "/status",
    } <= hrefs


def test_unknown_tool_and_invalid_args_become_error_results(db):
    assert "error" in json.loads(run_tool(db, "nope", {}))
    assert "error" in json.loads(run_tool(db, "search", {"q": 5, "extra": 1}))


def test_navigate_refuses_external_and_protocol_relative_hrefs(db):
    assert json.loads(run_tool(db, "navigate", {"href": "/seasons/2021/races/22"})) == {
        "navigated": True,
        "href": "/seasons/2021/races/22",
    }
    assert "error" in json.loads(run_tool(db, "navigate", {"href": "https://example.com"}))
    assert "error" in json.loads(run_tool(db, "navigate", {"href": "//example.com"}))


def test_tool_label_is_short_and_never_raises():
    assert tool_label("search", {"q": "hamilton"}) == "search: hamilton"
    assert tool_label("search", {"q": 5}) == "working"
    assert tool_label("nope", {}) == "working"


def test_a_tool_exception_is_returned_not_raised(db, monkeypatch):
    from dataclasses import replace

    def boom(db, args):
        raise RuntimeError("db down")

    monkeypatch.setitem(TOOLS, "search", replace(TOOLS["search"], run=boom))
    assert json.loads(run_tool(db, "search", {"q": "x"}))["error"].startswith("RuntimeError")


def test_oversized_results_are_truncated_and_marked(db, monkeypatch):
    from dataclasses import replace

    monkeypatch.setitem(
        TOOLS, "search", replace(TOOLS["search"], run=lambda db, a: {"blob": "x" * 20_000})
    )
    raw = run_tool(db, "search", {"q": "x"})
    assert len(raw) <= MAX_TOOL_RESULT_CHARS
    assert json.loads(raw)["truncated"] is True


def test_navigate_sorts_last_even_when_registered_early(monkeypatch):
    from src.chat.tools import registry

    monkeypatch.setattr(
        registry,
        "TOOLS",
        {"navigate": TOOLS["navigate"], "search": TOOLS["search"]},
    )
    assert [s["name"] for s in registry.tool_specs()] == ["search", "navigate"]
