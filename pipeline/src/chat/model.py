"""The one place the code talks to the Claude API."""

from collections.abc import Iterator
from typing import Any, TypedDict

import anthropic

from src.chat.events import Done, Event, TextDelta, ToolCall, UsageEvent
from src.chat.ledger import Usage
from src.config import settings


class ToolSpec(TypedDict):
    name: str
    description: str
    input_schema: dict


Message = dict[str, Any]


def _client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def stream_turn(
    *,
    system: str,
    tools: list[ToolSpec],
    messages: list[Message],
    max_tokens: int,
    tool_choice: dict | None = None,
) -> Iterator[Event]:
    """One model turn as events: text deltas live, then (once the message is
    final) its tool calls, its usage and `Done` with the raw content the loop
    replays as the assistant turn. Tool calls wait for the final message
    because a streamed tool input is only valid JSON once complete."""
    # Fresh dicts per call: cache_control must never land on the shared specs.
    tool_params = [{**spec, "strict": True} for spec in tools]
    if tool_params:
        tool_params[-1]["cache_control"] = {"type": "ephemeral"}

    kwargs: dict[str, Any] = {
        "model": settings.chat_model,
        "max_tokens": max_tokens,
        "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        "tools": tool_params,
        "tool_choice": tool_choice or {"type": "auto"},
        "output_config": {"effort": "low"},
        "messages": messages,
    }

    with _client().messages.stream(**kwargs) as stream:
        for event in stream:
            if event.type == "text":
                yield TextDelta(event.text)
        final = stream.get_final_message()

    for block in final.content:
        if block.type == "tool_use":
            yield ToolCall(block.id, block.name, dict(block.input))
    usage = final.usage
    yield UsageEvent(
        Usage(
            usage.input_tokens,
            usage.output_tokens,
            usage.cache_creation_input_tokens or 0,
            usage.cache_read_input_tokens or 0,
        )
    )
    yield Done(final.stop_reason, [b.model_dump() for b in final.content])
