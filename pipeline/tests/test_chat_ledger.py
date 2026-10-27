import datetime

from src.chat.ledger import (
    Usage,
    cost_of,
    day_start,
    ip_hash,
    record,
    requests_since,
    set_thumbs,
    spent_today,
)

UTC = datetime.UTC
NOW = datetime.datetime(2026, 10, 26, 15, 0, tzinfo=UTC)


def test_ip_hash_rotates_with_the_day_and_the_salt():
    a = ip_hash("203.0.113.9", NOW.date(), "salt")
    assert a == ip_hash("203.0.113.9", NOW.date(), "salt")
    assert a != ip_hash("203.0.113.9", NOW.date() + datetime.timedelta(days=1), "salt")
    assert a != ip_hash("203.0.113.9", NOW.date(), "other")
    assert "203.0.113.9" not in a and len(a) == 64


def test_cost_uses_the_price_table_per_million_tokens():
    u = Usage(
        input_tokens=1_000_000,
        output_tokens=1_000_000,
        cache_write_tokens=1_000_000,
        cache_read_tokens=1_000_000,
    )
    assert cost_of("claude-haiku-5-5", u) == 0.10 + 0.50 + 0.125 + 0.01


def test_spent_today_sums_only_rows_since_midnight_utc(db):
    yesterday = NOW - datetime.timedelta(days=1)
    record(
        db,
        model="claude-haiku-5-5",
        usage=Usage(output_tokens=2_000_000),
        tool_calls=0,
        outcome="ok",
        ip_hash="h",
        now=yesterday,
    )
    record(
        db,
        model="claude-haiku-5-5",
        usage=Usage(output_tokens=1_000_000),
        tool_calls=1,
        outcome="ok",
        ip_hash="h",
        now=NOW,
    )
    assert spent_today(db, NOW) == 0.50
    assert day_start(NOW) == datetime.datetime(2026, 10, 26, tzinfo=UTC)


def test_requests_since_counts_refused_rows_too(db):
    for outcome in ("ok", "rate_limited", "budget"):
        record(
            db,
            model="claude-haiku-5-5",
            usage=Usage(),
            tool_calls=0,
            outcome=outcome,
            ip_hash="h",
            now=NOW,
        )
    record(
        db,
        model="claude-haiku-5-5",
        usage=Usage(),
        tool_calls=0,
        outcome="ok",
        ip_hash="other",
        now=NOW,
    )
    assert requests_since(db, "h", NOW - datetime.timedelta(minutes=10)) == 3


def test_set_thumbs_updates_an_existing_row_only(db):
    row = record(
        db,
        model="claude-haiku-5-5",
        usage=Usage(),
        tool_calls=0,
        outcome="ok",
        ip_hash="h",
        now=NOW,
    )
    assert set_thumbs(db, row.id, 1) is True
    assert set_thumbs(db, "missing", -1) is False
    db.refresh(row)
    assert row.thumbs == 1


def test_usage_add_accumulates_every_counter():
    total = Usage(input_tokens=1, output_tokens=2)
    total.add(Usage(input_tokens=10, cache_write_tokens=3, cache_read_tokens=4))
    assert total == Usage(
        input_tokens=11, output_tokens=2, cache_write_tokens=3, cache_read_tokens=4
    )
