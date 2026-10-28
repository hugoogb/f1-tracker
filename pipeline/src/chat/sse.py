"""Server-sent event framing."""

import json


def sse(event: str, data: dict) -> str:
    """One SSE frame; `json.dumps` escapes newlines, so `data` stays on one line."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
