"""The tool registry the chat loop calls: schemas out, validated and bounded runs in."""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ValidationError
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.chat.constants import MAX_TOOL_RESULT_CHARS, NAVIGATE, STATEMENT_TIMEOUT_MS
from src.chat.model import ToolSpec


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    args: type[BaseModel]
    run: Callable[[Session, Any], dict]
    label: Callable[[Any], str]


TOOLS: dict[str, Tool] = {}


def register(tool: Tool) -> Tool:
    TOOLS[tool.name] = tool
    return tool


def _strictify(node: Any) -> Any:
    if isinstance(node, list):
        return [_strictify(n) for n in node]
    if not isinstance(node, dict):
        return node
    out = {k: _strictify(v) for k, v in node.items() if k != "title"}
    any_of = out.get("anyOf")
    if (
        isinstance(any_of, list)
        and len(any_of) == 2
        and {"type": "null"} in any_of
        and all(set(o) == {"type"} for o in any_of)
    ):
        other = next(o for o in any_of if o != {"type": "null"})
        del out["anyOf"]
        out["type"] = [other["type"], "null"]
    if out.get("type") == "object" or "properties" in out:
        props = out.setdefault("properties", {})
        out["required"] = list(props)
        out["additionalProperties"] = False
    return out


def strict_schema(model: type[BaseModel]) -> dict:
    return _strictify(model.model_json_schema())


def tool_specs() -> list[ToolSpec]:
    tools = sorted(TOOLS.values(), key=lambda t: t.name == NAVIGATE)  # stable: navigate last
    return [
        {"name": t.name, "description": t.description, "input_schema": strict_schema(t.args)}
        for t in tools
    ]


def _error(message: str) -> str:
    return json.dumps({"error": message})


def run_tool(db: Session, name: str, raw_args: dict) -> str:
    tool = TOOLS.get(name)
    if tool is None:
        return _error(f"unknown tool {name}")
    try:
        args = tool.args(**raw_args)
    except (ValidationError, TypeError) as e:
        return _error(f"invalid arguments: {e}"[:300])
    try:
        if db.get_bind().dialect.name == "postgresql":
            db.execute(text(f"SET LOCAL statement_timeout = {int(STATEMENT_TIMEOUT_MS)}"))
        out = json.dumps(tool.run(db, args), default=str)
    except Exception as e:  # noqa: BLE001 - the model gets the error text
        return _error(f"{type(e).__name__}: {e}"[:300])
    finally:
        db.rollback()
    if len(out) > MAX_TOOL_RESULT_CHARS:
        # Leave room for the JSON escaping the cut text picks up when re-encoded.
        budget = MAX_TOOL_RESULT_CHARS - 60
        while True:
            wrapped = json.dumps({"truncated": True, "partial": out[:budget]})
            if len(wrapped) <= MAX_TOOL_RESULT_CHARS:
                return wrapped
            budget -= 100
    return out


def tool_label(name: str, raw_args: dict) -> str:
    tool = TOOLS.get(name)
    if tool is None:
        return "working"
    try:
        return tool.label(tool.args(**raw_args))
    except Exception:  # noqa: BLE001 - a label must never break the stream
        return "working"
