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


def test_navigate_allowlist_rejects_browser_normalised_external_hrefs(db):
    for bad in ["/\\example.com", "/\t/example.com", "/\n/example.com"]:
        assert "error" in json.loads(run_tool(db, "navigate", {"href": bad})), bad
    for good in ["/seasons/2024?x=1", "/seasons/2021/races/22"]:
        assert json.loads(run_tool(db, "navigate", {"href": good}))["navigated"] is True


def test_strict_schema_flattens_bounded_and_literal_nullables_and_keeps_title_args():
    from typing import Literal

    from pydantic import BaseModel, ConfigDict, Field

    from src.chat.tools.registry import strict_schema

    class A(BaseModel):
        model_config = ConfigDict(extra="forbid")
        n: int | None = Field(default=None, ge=1)
        k: Literal["a", "b"] | None = None
        title: str = "x"

    schema = strict_schema(A)
    assert "anyOf" not in json.dumps(schema)
    assert schema["properties"]["n"]["minimum"] == 1
    assert schema["properties"]["n"]["type"] == ["integer", "null"]
    assert {"a", "b"} <= set(schema["properties"]["k"]["enum"])
    assert "title" in schema["properties"]
    assert "default" not in json.dumps(schema)
    assert sorted(schema["required"]) == ["k", "n", "title"]


def _spy_statements(db, monkeypatch) -> list[str]:
    """Swallow `SET LOCAL` (SQLite cannot run it) and record what was sent."""
    sent: list[str] = []
    real = db.execute

    def execute(statement, *a, **kw):
        sql = str(statement)
        sent.append(sql)
        if sql.startswith("SET LOCAL"):
            return None
        return real(statement, *a, **kw)

    monkeypatch.setattr(db, "execute", execute)
    return sent


def test_statement_timeout_is_set_on_postgresql(db, monkeypatch):
    from src.chat.tools import registry

    monkeypatch.setattr(registry, "_is_postgres", lambda db: True)
    sent = _spy_statements(db, monkeypatch)
    run_tool(db, "site_map", {})
    assert sent == ["SET LOCAL statement_timeout = 5000"]


def test_statement_timeout_is_not_set_on_sqlite(db, monkeypatch):
    sent = _spy_statements(db, monkeypatch)
    run_tool(db, "site_map", {})
    assert not any(s.startswith("SET LOCAL") for s in sent)


def _count_rollbacks(db, monkeypatch) -> list[int]:
    calls: list[int] = []
    real = db.rollback
    monkeypatch.setattr(db, "rollback", lambda: (calls.append(1), real())[1])
    return calls


def test_a_failing_tool_still_rolls_back(db, monkeypatch):
    from dataclasses import replace

    def boom(db, args):
        raise RuntimeError("db down")

    monkeypatch.setitem(TOOLS, "search", replace(TOOLS["search"], run=boom))
    calls = _count_rollbacks(db, monkeypatch)
    run_tool(db, "search", {"q": "x"})
    assert calls == [1]


def test_a_tool_raising_http_exception_rolls_back_and_reports_it(db, monkeypatch):
    from dataclasses import replace

    from fastapi import HTTPException

    def not_found(db, args):
        raise HTTPException(status_code=404, detail="Driver not found")

    monkeypatch.setitem(TOOLS, "search", replace(TOOLS["search"], run=not_found))
    calls = _count_rollbacks(db, monkeypatch)
    out = json.loads(run_tool(db, "search", {"q": "x"}))
    assert out["error"].startswith("HTTPException")
    assert calls == [1]


def test_site_map_fits_the_tool_result_cap(db):
    raw = run_tool(db, "site_map", {})
    assert len(raw) < MAX_TOOL_RESULT_CHARS
    assert "truncated" not in json.loads(raw)


def test_navigate_refuses_dot_dot_segments(db):
    for bad in ["/../x", "/seasons/../../x", "/seasons/..", "/..", "/../x?y=1"]:
        assert "error" in json.loads(run_tool(db, "navigate", {"href": bad})), bad
    for good in ["/drivers/carlos-sainz-jr.", "/seasons/2024?x=1"]:
        assert json.loads(run_tool(db, "navigate", {"href": good}))["navigated"] is True, good
