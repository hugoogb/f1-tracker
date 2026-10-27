"""Pre-model gates: client identity, the daily budget and the per-IP rate."""

import datetime
import ipaddress
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
    forwarded = (request.headers.get("cf-connecting-ip") or "").strip()
    if forwarded:
        return normalise_ip(forwarded)
    return normalise_ip(request.client.host) if request.client else "unknown"


def normalise_ip(ip: str) -> str:
    """One identity per subscriber: an IPv6 caller is its /64 (one host can
    rotate through the whole prefix), an IPv4-mapped IPv6 address is its IPv4.
    A value that does not parse is kept as-is; it is still only ever hashed."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if isinstance(addr, ipaddress.IPv6Address):
        if addr.ipv4_mapped is not None:
            return str(addr.ipv4_mapped)
        return str(ipaddress.ip_network(f"{addr}/64", strict=False).network_address)
    return str(addr)


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
