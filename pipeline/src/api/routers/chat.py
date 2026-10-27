"""The Race Engineer: `POST /api/chat` (SSE) and `POST /api/chat/feedback`."""

from collections.abc import AsyncIterator, Iterator
from typing import Literal

import anyio
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.concurrency import iterate_in_threadpool, run_in_threadpool

from src.chat import ledger
from src.chat.gates import check_gates, client_ip
from src.chat.loop import ChatRequest, run_chat, utcnow
from src.config import settings
from src.db.database import get_db

router = APIRouter()


async def _stream(gen: Iterator[str]) -> AsyncIterator[str]:
    """Drive the sync SSE generator and always close it.

    Starlette never closes a sync generator it iterates, and on a client
    disconnect it cancels the response's task group, so the close runs shielded:
    `run_chat`'s `finally` is what writes the ledger row.
    """
    try:
        async for chunk in iterate_in_threadpool(gen):
            yield chunk
    finally:
        with anyio.CancelScope(shield=True):
            await run_in_threadpool(gen.close)


@router.post("/chat")
def chat(body: ChatRequest, request: Request, db: Session = Depends(get_db)):
    if not settings.chat_enabled:
        raise HTTPException(status_code=503, detail={"code": "disabled"})
    now = utcnow()
    caller = ledger.ip_hash(client_ip(request), now.date(), settings.chat_ip_salt)
    refusal = check_gates(db, caller, now)
    if refusal is not None:
        ledger.record(
            db,
            model=settings.chat_model,
            usage=ledger.Usage(),
            tool_calls=0,
            outcome=refusal.code,
            ip_hash=caller,
            now=now,
        )
        return JSONResponse(
            status_code=refusal.status,
            content={"detail": {"code": refusal.code, "message": refusal.message}},
        )
    db.rollback()  # end the gates' read transaction before the stream starts
    return StreamingResponse(
        _stream(run_chat(db, body, ip_hash=caller, now=now)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store"},
    )


class Feedback(BaseModel):
    id: str = Field(max_length=64)
    thumbs: Literal[1, -1]


@router.post("/chat/feedback", status_code=204)
def feedback(body: Feedback, db: Session = Depends(get_db)) -> Response:
    if not settings.chat_enabled:
        raise HTTPException(status_code=503, detail={"code": "disabled"})
    if not ledger.set_thumbs(db, body.id, body.thumbs):
        raise HTTPException(status_code=404, detail="Chat response not found")
    return Response(status_code=204)
