from types import SimpleNamespace

import pytest

from src.chat import model as chat_model
from src.chat.events import Done, TextDelta, ToolCall, UsageEvent


class FakeStream:
    def __init__(self, events, final):
        self._events, self._final = events, final

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def __iter__(self):
        return iter(self._events)

    def get_final_message(self):
        return self._final


class Block(SimpleNamespace):
    def model_dump(self):
        return dict(vars(self))


@pytest.fixture
def captured(monkeypatch):
    calls = {}
    text_events = [
        SimpleNamespace(type="text", text="Max "),
        SimpleNamespace(type="text", text="leads."),
    ]
    final = SimpleNamespace(
        stop_reason="tool_use",
        content=[
            Block(type="text", text="Max leads."),
            Block(
                type="tool_use",
                id="tu_1",
                name="get_standings",
                input={"year": 2024, "kind": "drivers", "focus_ref": None},
            ),
        ],
        usage=SimpleNamespace(
            input_tokens=1500,
            output_tokens=40,
            cache_creation_input_tokens=1200,
            cache_read_input_tokens=None,
        ),
    )

    def stream(**kwargs):
        calls.update(kwargs)
        return FakeStream(text_events, final)

    monkeypatch.setattr(
        chat_model,
        "_client",
        lambda: SimpleNamespace(messages=SimpleNamespace(stream=stream)),
    )
    monkeypatch.setattr(chat_model.settings, "chat_model", "claude-haiku-5-5")
    return calls


TOOLS = [
    {
        "name": "search",
        "description": "d",
        "input_schema": {
            "type": "object",
            "properties": {"q": {"type": "string"}},
            "required": ["q"],
            "additionalProperties": False,
        },
    },
    {
        "name": "get_standings",
        "description": "d",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        },
    },
]


def test_stream_turn_yields_text_then_tool_calls_usage_and_done(captured):
    events = list(
        chat_model.stream_turn(
            system="S",
            tools=TOOLS,
            messages=[{"role": "user", "content": "q"}],
            max_tokens=600,
        )
    )
    assert events[:2] == [TextDelta("Max "), TextDelta("leads.")]
    assert events[2] == ToolCall(
        "tu_1", "get_standings", {"year": 2024, "kind": "drivers", "focus_ref": None}
    )
    usage = next(e for e in events if isinstance(e, UsageEvent)).usage
    assert (
        usage.input_tokens,
        usage.output_tokens,
        usage.cache_write_tokens,
        usage.cache_read_tokens,
    ) == (1500, 40, 1200, 0)
    done = events[-1]
    assert (
        isinstance(done, Done)
        and done.stop_reason == "tool_use"
        and done.content[1]["name"] == "get_standings"
    )


def test_request_shape_matches_the_spec(captured):
    list(
        chat_model.stream_turn(
            system="S",
            tools=TOOLS,
            messages=[{"role": "user", "content": "q"}],
            max_tokens=600,
        )
    )
    assert captured["model"] == "claude-haiku-5-5"
    assert captured["max_tokens"] == 600
    assert captured["system"] == [
        {"type": "text", "text": "S", "cache_control": {"type": "ephemeral"}}
    ]
    assert captured["output_config"] == {"effort": "low"}
    assert captured["tool_choice"] == {"type": "auto"}
    assert "thinking" not in captured
    assert all(t["strict"] is True for t in captured["tools"])
    assert "cache_control" not in captured["tools"][0] and captured["tools"][-1][
        "cache_control"
    ] == {"type": "ephemeral"}
    assert all("strict" not in t and "cache_control" not in t for t in TOOLS)


def test_tool_choice_can_be_forced_off_for_the_final_turn(captured):
    list(
        chat_model.stream_turn(
            system="S",
            tools=TOOLS,
            messages=[{"role": "user", "content": "q"}],
            max_tokens=600,
            tool_choice={"type": "none"},
        )
    )
    assert captured["tool_choice"] == {"type": "none"}
