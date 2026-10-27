"""The Race Engineer's tool loop: model turns, tool runs and the SSE stream.

Synchronous on purpose: `StreamingResponse` runs this generator in Starlette's
threadpool, and the database layer is synchronous SQLAlchemy.
"""

import datetime
import json
import logging
from collections.abc import Iterator
from typing import Literal

from pydantic import BaseModel, Field, constr, field_validator, model_validator
from sqlalchemy.orm import Session

import src.chat.tools  # noqa: F401 - registers every tool
from src.chat import ledger
from src.chat.constants import (
    HISTORY_TURNS,
    INPUT_SOFT_CAP_TOKENS,
    MAX_CONVERSATION_TURNS,
    MAX_TOOL_CALLS,
    NAVIGATE,
)
from src.chat.events import Done, TextDelta, ToolCall, UsageEvent
from src.chat.model import Message, stream_turn
from src.chat.prompt import SYSTEM, user_turn
from src.chat.sse import sse
from src.chat.tools.registry import run_tool, tool_label, tool_specs
from src.config import settings

logger = logging.getLogger(__name__)

PROVIDER_ERROR = "The Engineer lost the radio. Try again."
INTERNAL_ERROR = "The Engineer hit a problem. Try again."
CAP_ERROR = "tool call limit reached; answer now"
CAP_NUDGE = "Answer with what you have."


# Measured size of the cached prefix (system prompt + 18 tool schemas), in tokens.
# Stands in for the input of a turn that failed before reporting its usage.
SYSTEM_AND_TOOLS_ESTIMATE = 2_000

SITE_PATH = r"^/[A-Za-z0-9_\-./]*(\?[A-Za-z0-9_=&\-]*)?$"


class ProviderError(Exception):
    """A failure inside the model call, as opposed to one in the loop's own work."""


def _model_turn(**kwargs) -> Iterator:
    """`stream_turn`, with anything it raises tagged as the provider's.

    Only exceptions raised inside the generator are wrapped; one raised while
    the loop handles an event surfaces in the loop, so the tag cannot blame the
    provider for the database or the tools.
    """
    try:
        yield from stream_turn(**kwargs)
    except Exception as e:  # noqa: BLE001 - re-raised, tagged
        raise ProviderError(str(e)) from e


def utcnow() -> datetime.datetime:
    """The one clock for the chat: the router, the loop and the tests all read it."""
    return datetime.datetime.now(datetime.UTC)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: constr(strip_whitespace=True, min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=2 * MAX_CONVERSATION_TURNS)
    path: str = Field(default="/", max_length=200, pattern=SITE_PATH)
    pageTitle: str | None = Field(default=None, max_length=200)  # noqa: N815 - wire name

    @field_validator("path")
    @classmethod
    def _one_site_path(cls, path: str) -> str:
        if "//" in path:
            raise ValueError("path must be a site path")
        return path

    @model_validator(mode="after")
    def _ends_with_the_question(self) -> "ChatRequest":
        if self.messages[-1].role != "user":
            raise ValueError("the last message must be the user's")
        return self


def build_messages(body: ChatRequest, today: datetime.date) -> list[Message]:
    """The last `HISTORY_TURNS` exchanges plus the question, wrapped with today's date and page."""
    question = body.messages[-1].content
    history = body.messages[:-1][-2 * HISTORY_TURNS :]
    while history and history[0].role != "user":
        history = history[1:]

    def tokens() -> int:
        context = len(body.path) + len(body.pageTitle or "")
        return (sum(len(m.content) for m in history) + len(question) + context) // 4

    while history and tokens() > INPUT_SOFT_CAP_TOKENS:
        history = history[2:]

    turn = user_turn(question, path=body.path, page_title=body.pageTitle, today=today)
    return [
        *({"role": m.role, "content": m.content} for m in history),
        {"role": "user", "content": turn},
    ]


def run_chat(
    db: Session, body: ChatRequest, *, ip_hash: str, now: datetime.datetime
) -> Iterator[str]:
    """Stream one answer as SSE; the ledger row is written however the stream ends."""
    usage = ledger.Usage()
    tool_calls = 0
    outcome = "ok"
    # The gates read on this session; end that transaction so no pooled
    # connection idles in one while the model streams.
    db.rollback()
    messages = build_messages(body, now.date())
    tools = tool_specs()
    turn_usage_seen = True
    try:
        tool_choice: dict | None = None
        while True:
            calls: list[ToolCall] = []
            done: Done | None = None
            turn_usage_seen = False
            for event in _model_turn(
                system=SYSTEM,
                tools=tools,
                messages=messages,
                max_tokens=settings.chat_max_tokens,
                tool_choice=tool_choice,
            ):
                if isinstance(event, TextDelta):
                    yield sse("text", {"delta": event.text})
                elif isinstance(event, ToolCall):
                    calls.append(event)
                elif isinstance(event, UsageEvent):
                    usage.add(event.usage)
                    turn_usage_seen = True
                elif isinstance(event, Done):
                    done = event
            # The forced final turn is the last one, whatever the model does.
            final = tool_choice is not None
            if final or done is None or done.stop_reason != "tool_use" or not calls:
                break

            results: list[dict] = []
            for call in calls:
                if tool_calls >= MAX_TOOL_CALLS:
                    result = json.dumps({"error": CAP_ERROR})
                else:
                    tool_calls += 1
                    yield sse(
                        "tool", {"name": call.name, "label": tool_label(call.name, call.args)}
                    )
                    result = run_tool(db, call.name, call.args)
                parsed = json.loads(result)
                is_error = isinstance(parsed, dict) and "error" in parsed
                if call.name == NAVIGATE and isinstance(parsed, dict) and parsed.get("navigated"):
                    yield sse("navigate", {"href": parsed["href"]})
                results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": call.id,
                        "content": result,
                        "is_error": is_error,
                    }
                )
            if tool_calls >= MAX_TOOL_CALLS:
                tool_choice = {"type": "none"}
                results.append({"type": "text", "text": CAP_NUDGE})
            # A new list per turn: the list handed to a past turn is never mutated.
            messages = [
                *messages,
                {"role": "assistant", "content": done.content},
                {"role": "user", "content": results},
            ]
    except Exception as e:  # noqa: BLE001 - any failure ends the stream, not the server
        logger.exception("chat turn failed")
        outcome = "error"
        provider = isinstance(e, ProviderError)
        if not turn_usage_seen:
            # The turn died before its usage arrived; count it conservatively
            # rather than as free, so the budget never under-counts.
            usage.add(
                ledger.Usage(
                    input_tokens=len(json.dumps(messages)) // 4 + SYSTEM_AND_TOOLS_ESTIMATE,
                    output_tokens=settings.chat_max_tokens,
                )
            )
        if provider:
            yield sse("error", {"code": "provider", "message": PROVIDER_ERROR})
        else:
            yield sse("error", {"code": "internal", "message": INTERNAL_ERROR})
    finally:
        # Runs on a client disconnect too (GeneratorExit), so spend is never lost.
        row = ledger.record(
            db,
            model=settings.chat_model,
            usage=usage,
            tool_calls=tool_calls,
            outcome=outcome,
            ip_hash=ip_hash,
            now=now,
        )
    if outcome == "ok":
        yield sse("usage", {"toolCalls": tool_calls, "costUsd": row.cost_usd})
    yield sse("done", {"id": row.id, "outcome": outcome})
