"""What one model turn emits, in order: text, tool calls, usage, then done."""

from dataclasses import dataclass

from src.chat.ledger import Usage


@dataclass(frozen=True)
class TextDelta:
    text: str


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    args: dict


@dataclass(frozen=True)
class UsageEvent:
    usage: Usage


@dataclass(frozen=True)
class Done:
    stop_reason: str
    # The raw assistant content blocks, replayed verbatim in the next turn.
    content: list


Event = TextDelta | ToolCall | UsageEvent | Done
