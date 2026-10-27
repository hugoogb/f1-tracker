import json

import pytest

from src.chat import loop as chat_loop
from src.chat.events import Done, TextDelta, ToolCall, UsageEvent
from src.chat.ledger import Usage
from src.config import settings
from src.db.models import ChatUsage


def parse_sse(body: str) -> list[tuple[str, dict]]:
    out = []
    for chunk in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in chunk.splitlines())
        out.append((lines["event"], json.loads(lines["data"])))
    return out


@pytest.fixture
def chat_on(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "k")
    monkeypatch.setattr(settings, "chat_model", "claude-haiku-5-5")
    monkeypatch.setattr(settings, "chat_ip_salt", "s")


def script(turns, db=None):
    """Each turn is a list of events; stream_turn pops the next one and records its inputs.

    Given `db`, every model call also asserts no transaction is open on it: a
    stream must not pin a pooled connection idle-in-transaction.
    """
    seen = []

    def fake(*, system, tools, messages, max_tokens, tool_choice=None):
        if db is not None:
            assert not db.in_transaction()
        seen.append({"messages": messages, "tool_choice": tool_choice})
        yield from turns.pop(0)

    return fake, seen


def usage():
    return UsageEvent(Usage(input_tokens=1000, output_tokens=50))


def test_disabled_chat_is_503(client):
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 503


def test_happy_path_streams_text_tool_usage_and_done_and_writes_one_row(
    client, db, chat_on, seed_data, monkeypatch
):
    args = {"year": 2023, "kind": "drivers", "focus_ref": None}
    answer = "Max leads. [2023](/seasons/2023)"
    fake, seen = script(
        [
            [
                TextDelta("Checking."),
                ToolCall("t1", "get_standings", args),
                usage(),
                Done(
                    "tool_use",
                    [
                        {"type": "text", "text": "Checking."},
                        {"type": "tool_use", "id": "t1", "name": "get_standings", "input": args},
                    ],
                ),
            ],
            [TextDelta(answer), usage(), Done("end_turn", [{"type": "text", "text": answer}])],
        ],
        db,
    )
    monkeypatch.setattr(chat_loop, "stream_turn", fake)
    r = client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "Who leads?"}],
            "path": "/seasons/2023",
            "pageTitle": "2023",
        },
        headers={"Cf-Connecting-Ip": "198.51.100.7"},
    )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.headers["cache-control"] == "no-store"
    events = parse_sse(r.text)
    assert events[0] == ("text", {"delta": "Checking."})
    assert events[1] == ("tool", {"name": "get_standings", "label": "2023 standings"})
    assert ("text", {"delta": answer}) in events
    assert events[-2][0] == "usage" and events[-2][1]["toolCalls"] == 1
    assert events[-1][0] == "done" and events[-1][1]["outcome"] == "ok"
    rows = db.query(ChatUsage).all()
    assert len(rows) == 1 and rows[0].tool_calls == 1
    assert rows[0].input_tokens == 2000 and rows[0].cost_usd > 0
    assert rows[0].id == events[-1][1]["id"]
    # The tool result went back as a tool_result block; the user turn carried the page context.
    second = seen[1]["messages"]
    assert second[-1]["role"] == "user" and second[-1]["content"][0]["type"] == "tool_result"
    first_user = seen[0]["messages"][-1]["content"]
    assert "[Today:" in first_user and "/seasons/2023" in first_user


def test_tool_call_cap_forces_a_final_answer_without_tools(
    client, db, chat_on, seed_data, monkeypatch
):
    def call(i):
        return ToolCall(f"t{i}", "site_map", {})

    def block(i):
        return {"type": "tool_use", "id": f"t{i}", "name": "site_map", "input": {}}

    turns = [[call(i), usage(), Done("tool_use", [block(i)])] for i in range(6)]
    final = "Here is what I have."
    turns.append([TextDelta(final), usage(), Done("end_turn", [{"type": "text", "text": final}])])
    fake, seen = script(turns)
    monkeypatch.setattr(chat_loop, "stream_turn", fake)
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "loop"}]})
    assert seen[-1]["tool_choice"] == {"type": "none"}
    assert all(s["tool_choice"] is None for s in seen[:-1])
    assert "Answer with what you have." in json.dumps(seen[-1]["messages"][-1])
    assert parse_sse(r.text)[-1][1]["outcome"] == "ok"
    assert db.query(ChatUsage).one().tool_calls == 6


def test_tool_calls_past_the_cap_get_error_results_and_are_not_run(
    client, db, chat_on, monkeypatch
):
    calls = [ToolCall(f"t{i}", "site_map", {}) for i in range(8)]
    blocks = [
        {"type": "tool_use", "id": f"t{i}", "name": "site_map", "input": {}} for i in range(8)
    ]
    fake, seen = script(
        [
            [*calls, usage(), Done("tool_use", blocks)],
            [TextDelta("Done."), usage(), Done("end_turn", [{"type": "text", "text": "Done."}])],
        ]
    )
    monkeypatch.setattr(chat_loop, "stream_turn", fake)
    events = parse_sse(
        client.post("/api/chat", json={"messages": [{"role": "user", "content": "x"}]}).text
    )
    content = seen[1]["messages"][-1]["content"]
    results = [b for b in content if b["type"] == "tool_result"]
    assert [b["is_error"] for b in results] == [False] * 6 + [True] * 2
    assert json.loads(results[-1]["content"]) == {"error": "tool call limit reached; answer now"}
    assert content[-1] == {"type": "text", "text": "Answer with what you have."}
    assert seen[1]["tool_choice"] == {"type": "none"}
    assert len([e for e, _ in events if e == "tool"]) == 6
    assert db.query(ChatUsage).one().tool_calls == 6


def test_unknown_tool_and_bad_args_are_error_results_and_the_loop_continues(
    client, db, chat_on, monkeypatch
):
    fake, seen = script(
        [
            [
                ToolCall("t1", "nope", {}),
                ToolCall("t2", "search", {"q": 3}),
                usage(),
                Done(
                    "tool_use",
                    [
                        {"type": "tool_use", "id": "t1", "name": "nope", "input": {}},
                        {"type": "tool_use", "id": "t2", "name": "search", "input": {"q": 3}},
                    ],
                ),
            ],
            [TextDelta("Sorry."), usage(), Done("end_turn", [{"type": "text", "text": "Sorry."}])],
        ]
    )
    monkeypatch.setattr(chat_loop, "stream_turn", fake)
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "x"}]})
    results = seen[1]["messages"][-1]["content"]
    assert all(block["is_error"] for block in results)
    assert parse_sse(r.text)[-1][1]["outcome"] == "ok"


def test_navigate_emits_an_event_only_for_site_paths(client, db, chat_on, monkeypatch):
    bad = {"href": "https://evil.example"}
    good = {"href": "/seasons/2021/races/22"}
    fake, _ = script(
        [
            [
                ToolCall("t1", "navigate", bad),
                ToolCall("t2", "navigate", good),
                usage(),
                Done(
                    "tool_use",
                    [
                        {"type": "tool_use", "id": "t1", "name": "navigate", "input": bad},
                        {"type": "tool_use", "id": "t2", "name": "navigate", "input": good},
                    ],
                ),
            ],
            [
                TextDelta("Opening."),
                usage(),
                Done("end_turn", [{"type": "text", "text": "Opening."}]),
            ],
        ]
    )
    monkeypatch.setattr(chat_loop, "stream_turn", fake)
    body = {"messages": [{"role": "user", "content": "open abu dhabi 2021"}]}
    events = parse_sse(client.post("/api/chat", json=body).text)
    assert [d for e, d in events if e == "navigate"] == [good]


def test_provider_error_ends_with_an_error_event_and_an_error_row(client, db, chat_on, monkeypatch):
    def boom(**kwargs):
        yield TextDelta("Max")
        raise RuntimeError("upstream 529")

    monkeypatch.setattr(chat_loop, "stream_turn", boom)
    events = parse_sse(
        client.post("/api/chat", json={"messages": [{"role": "user", "content": "x"}]}).text
    )
    assert events[-2] == (
        "error",
        {"code": "provider", "message": "The Engineer lost the radio. Try again."},
    )
    assert events[-1][1]["outcome"] == "error"
    row = db.query(ChatUsage).one()
    assert row.outcome == "error"
    # The failed turn never reported usage, so a conservative estimate is recorded.
    assert row.input_tokens >= chat_loop.SYSTEM_AND_TOOLS_ESTIMATE
    assert row.output_tokens == settings.chat_max_tokens == 600


def test_client_disconnect_still_writes_the_row(db, chat_on, monkeypatch):
    fake, _ = script(
        [
            [
                TextDelta("a"),
                TextDelta("b"),
                usage(),
                Done("end_turn", [{"type": "text", "text": "ab"}]),
            ]
        ]
    )
    monkeypatch.setattr(chat_loop, "stream_turn", fake)
    gen = chat_loop.run_chat(
        db,
        chat_loop.ChatRequest(messages=[{"role": "user", "content": "x"}]),
        ip_hash="h",
        now=chat_loop.utcnow(),
    )
    next(gen)
    gen.close()
    assert db.query(ChatUsage).count() == 1


@pytest.mark.parametrize(
    "body",
    [
        {"messages": []},
        {"messages": [{"role": "user", "content": "   "}]},
        {"messages": [{"role": "user", "content": "a"}, {"role": "assistant", "content": "b"}]},
        {"messages": [{"role": "user", "content": "x" * 2001}]},
    ],
)
def test_invalid_bodies_are_400_level_and_write_no_row(client, db, chat_on, body):
    assert client.post("/api/chat", json=body).status_code == 422
    assert db.query(ChatUsage).count() == 0


@pytest.mark.parametrize(
    "path", ["/" + "a" * 300, "/seasons/2024 x", "//evil.example", "/seasons//2024", "seasons"]
)
def test_paths_that_are_not_site_paths_are_422(client, db, chat_on, path):
    body = {"messages": [{"role": "user", "content": "x"}], "path": path}
    assert client.post("/api/chat", json=body).status_code == 422
    assert db.query(ChatUsage).count() == 0


def test_a_path_with_a_query_string_is_accepted():
    body = chat_loop.ChatRequest(
        messages=[{"role": "user", "content": "x"}], path="/seasons/2024?type=drivers&a=x&b=y"
    )
    assert body.path == "/seasons/2024?type=drivers&a=x&b=y"


def test_rate_and_budget_refusals_are_json_not_streams(client, db, chat_on, monkeypatch):
    monkeypatch.setattr(settings, "chat_ip_per_10min", 0)
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "x"}]})
    assert r.status_code == 429 and r.json()["detail"]["code"] == "rate_limited"
    assert db.query(ChatUsage).one().outcome == "rate_limited"


def test_budget_refusal_is_503_json(client, db, chat_on, monkeypatch):
    monkeypatch.setattr(settings, "chat_daily_budget_usd", 0)
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "x"}]})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "budget"
    assert r.json()["detail"]["message"] == "Off the radio until tomorrow."
    assert db.query(ChatUsage).one().outcome == "budget"


def test_history_window_keeps_the_last_eight_turns():
    msgs = [
        {"role": "user" if i % 2 == 0 else "assistant", "content": f"m{i}"} for i in range(30)
    ] + [{"role": "user", "content": "last"}]
    built = chat_loop.build_messages(
        chat_loop.ChatRequest(messages=msgs), today=chat_loop.utcnow().date()
    )
    assert len(built) == 17 and built[0]["role"] == "user"
    assert built[-1]["content"].endswith("last")


def test_history_drops_oldest_pairs_past_the_soft_cap(monkeypatch):
    monkeypatch.setattr(chat_loop, "INPUT_SOFT_CAP_TOKENS", 1_200)
    big = "y" * 2000
    msgs = []
    for _ in range(8):
        msgs += [{"role": "user", "content": big}, {"role": "assistant", "content": big}]
    msgs.append({"role": "user", "content": "last"})
    built = chat_loop.build_messages(
        chat_loop.ChatRequest(messages=msgs), today=chat_loop.utcnow().date()
    )
    # 4,000 chars per pair: only one pair fits under 1,200 tokens alongside the question.
    assert len(built) == 3 and built[0]["role"] == "user"
    assert built[-1]["content"].endswith("last")


def test_feedback_sets_thumbs(client, db, chat_on):
    from src.chat.ledger import record

    row = record(
        db,
        model="claude-haiku-5-5",
        usage=Usage(),
        tool_calls=0,
        outcome="ok",
        ip_hash="h",
        now=chat_loop.utcnow(),
    )
    assert client.post("/api/chat/feedback", json={"id": row.id, "thumbs": -1}).status_code == 204
    db.refresh(row)
    assert row.thumbs == -1
    assert client.post("/api/chat/feedback", json={"id": "nope", "thumbs": 1}).status_code == 404
