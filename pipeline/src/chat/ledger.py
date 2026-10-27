"""The chat ledger: what a request cost, and the counters the gates read.

Everything here works on `chat_usage` rows, which never hold content (see
`ChatUsage`). Date bounds are computed in Python and compared as
`created_at >= bound`, so the same queries run on PostgreSQL and SQLite.
"""

import datetime
import hashlib
import hmac
import json
from dataclasses import dataclass

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from src.config import settings
from src.db.models import ChatUsage

PROVIDER = "anthropic"


@dataclass
class Usage:
    """Token counts for one request, summed across its model turns; the four
    buckets are priced separately (see `cost_of`)."""

    input_tokens: int = 0
    output_tokens: int = 0
    cache_write_tokens: int = 0
    cache_read_tokens: int = 0

    def add(self, other: "Usage") -> None:
        """Fold one turn's counts in place: a tool loop is several turns, one bill."""
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.cache_write_tokens += other.cache_write_tokens
        self.cache_read_tokens += other.cache_read_tokens


def ip_hash(ip: str, day: datetime.date, salt: str) -> str:
    """HMAC-SHA256 of the IP, keyed by salt and day so it rotates at midnight UTC."""
    key = f"{salt}:{day.isoformat()}".encode()
    return hmac.new(key, ip.encode(), hashlib.sha256).hexdigest()


def cost_of(model: str, usage: Usage) -> float:
    """Dollars for `usage`, from the price table (per million tokens).

    An unpriced model raises `KeyError`: spending that cannot be counted must
    not slip past the budget.
    """
    price = json.loads(settings.chat_prices_json)[model]
    return (
        usage.input_tokens * price["input"]
        + usage.output_tokens * price["output"]
        + usage.cache_write_tokens * price["cache_write"]
        + usage.cache_read_tokens * price["cache_read"]
    ) / 1_000_000


def day_start(now: datetime.datetime) -> datetime.datetime:
    """Midnight UTC of `now`'s date: when the daily budget resets.

    `now` must be timezone-aware: `astimezone` would read a naive value as
    the server's local time and shift the day boundary by its offset.
    """
    now = now.astimezone(datetime.UTC)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def spent_today(db: Session, now: datetime.datetime) -> float:
    """Dollars recorded since midnight UTC, the figure the budget gate checks.
    A row stamped exactly at midnight belongs to the new day."""
    total = db.scalar(
        select(func.coalesce(func.sum(ChatUsage.cost_usd), 0.0)).where(
            ChatUsage.created_at >= day_start(now)
        )
    )
    return float(total)


def requests_since(db: Session, ip_hash: str, since: datetime.datetime) -> int:
    """Every row counts, refused ones included: they are requests too."""
    return (
        db.scalar(
            select(func.count())
            .select_from(ChatUsage)
            .where(ChatUsage.ip_hash == ip_hash, ChatUsage.created_at >= since)
        )
        or 0
    )


def record(
    db: Session,
    *,
    model: str,
    usage: Usage,
    tool_calls: int,
    outcome: str,
    ip_hash: str,
    now: datetime.datetime,
) -> ChatUsage:
    """Write one request's row and commit it straight away, so the next
    request's gates already see it. `now` must be UTC-aware, as for
    `day_start`: it is the timestamp every daily bound is compared against.
    Refused requests are recorded too, with empty usage."""
    row = ChatUsage(
        created_at=now,
        model=model,
        provider=PROVIDER,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        cache_write_tokens=usage.cache_write_tokens,
        cache_read_tokens=usage.cache_read_tokens,
        cost_usd=cost_of(model, usage),
        tool_calls=tool_calls,
        outcome=outcome,
        ip_hash=ip_hash,
    )
    db.add(row)
    db.commit()
    return row


def set_thumbs(db: Session, row_id: str, thumbs: int) -> bool:
    """Store the reader's verdict; False when no such row exists."""
    result = db.execute(update(ChatUsage).where(ChatUsage.id == row_id).values(thumbs=thumbs))
    db.commit()
    return result.rowcount > 0
