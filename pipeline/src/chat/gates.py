"""Pre-model gates: client identity, the daily budget and the per-IP rate."""

import datetime
from dataclasses import dataclass

from fastapi import Request
from sqlalchemy.orm import Session

from src.chat import ledger
from src.config import settings

RATE_WINDOW = datetime.timedelta(minutes=10)


@dataclass
class Refusal:
    status: int
    code: str  # "budget" | "rate_limited"
    message: str


def client_ip(request: Request) -> str:
    """The caller's address. Behind Cloudflare `request.client.host` is the
    proxy and X-Forwarded-For is forgeable, so identity is `Cf-Connecting-Ip`
    (the origin must be reachable only through Cloudflare)."""
    forwarded = request.headers.get("cf-connecting-ip")
    if forwarded:
        return forwarded
    return request.client.host if request.client else "unknown"


def check_gates(db: Session, ip_hash: str, now: datetime.datetime) -> Refusal | None:
    """Budget first, then the per-IP rate; None means the request may proceed."""
    if ledger.spent_today(db, now) >= settings.chat_daily_budget_usd:
        return Refusal(503, "budget", "Off the radio until tomorrow.")
    if (
        ledger.requests_since(db, ip_hash, now - RATE_WINDOW) >= settings.chat_ip_per_10min
        or ledger.requests_since(db, ip_hash, ledger.day_start(now)) >= settings.chat_ip_per_day
    ):
        return Refusal(429, "rate_limited", "Take a breath; try again in a few minutes.")
    return None
