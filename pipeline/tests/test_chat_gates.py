import datetime

import pytest
from fastapi import Request

from src.chat.gates import check_gates, client_ip
from src.chat.ledger import Usage, record
from src.config import settings

UTC = datetime.UTC
NOW = datetime.datetime(2026, 10, 26, 15, 0, tzinfo=UTC)


def make_request(headers: dict[str, str], client=("10.0.0.1", 1234)) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/chat",
            "headers": raw,
            "client": client,
            "query_string": b"",
        }
    )


def test_client_ip_reads_cf_connecting_ip_and_ignores_x_forwarded_for():
    req = make_request(
        {"Cf-Connecting-Ip": "198.51.100.7", "X-Forwarded-For": "203.0.113.9, 198.51.100.7"}
    )
    assert client_ip(req) == "198.51.100.7"


def test_client_ip_falls_back_to_the_socket_without_the_header():
    assert client_ip(make_request({"X-Forwarded-For": "203.0.113.9"})) == "10.0.0.1"


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        ("  198.51.100.7  ", "198.51.100.7"),
        ("2001:db8:1:2:3:4:5:6", "2001:db8:1:2::"),
        ("2001:db8:1:2:ffff::1", "2001:db8:1:2::"),
        ("::ffff:198.51.100.7", "198.51.100.7"),
        ("not-an-ip", "not-an-ip"),
    ],
)
def test_client_ip_normalises_the_header(header, expected):
    assert client_ip(make_request({"Cf-Connecting-Ip": header})) == expected


def test_a_blank_header_counts_as_absent():
    assert client_ip(make_request({"Cf-Connecting-Ip": "   "})) == "10.0.0.1"


def test_budget_gate_refuses_with_503_once_the_day_is_spent(db, monkeypatch):
    monkeypatch.setattr(settings, "chat_daily_budget_usd", 0.50)
    record(
        db,
        model="claude-haiku-5-5",
        usage=Usage(output_tokens=1_000_000),
        tool_calls=0,
        outcome="ok",
        ip_hash="x",
        now=NOW,
    )
    refusal = check_gates(db, "h", NOW)
    assert (refusal.status, refusal.code) == (503, "budget")


def test_rate_gate_refuses_with_429_after_ten_in_ten_minutes(db, monkeypatch):
    monkeypatch.setattr(settings, "chat_ip_per_10min", 10)
    for _ in range(10):
        record(
            db,
            model="claude-haiku-5-5",
            usage=Usage(),
            tool_calls=0,
            outcome="ok",
            ip_hash="h",
            now=NOW - datetime.timedelta(minutes=5),
        )
    assert check_gates(db, "h", NOW).status == 429
    assert check_gates(db, "someone-else", NOW) is None


def test_rate_gate_window_is_ten_minutes(db, monkeypatch):
    monkeypatch.setattr(settings, "chat_ip_per_10min", 1)
    monkeypatch.setattr(settings, "chat_ip_per_day", 60)
    record(
        db,
        model="claude-haiku-5-5",
        usage=Usage(),
        tool_calls=0,
        outcome="ok",
        ip_hash="h",
        now=NOW - datetime.timedelta(minutes=11),
    )
    assert check_gates(db, "h", NOW) is None


def test_rate_gate_refuses_with_429_once_the_day_limit_is_reached(db, monkeypatch):
    monkeypatch.setattr(settings, "chat_ip_per_10min", 100)
    monkeypatch.setattr(settings, "chat_ip_per_day", 3)
    for hours in (1, 2, 3):
        record(
            db,
            model="claude-haiku-5-5",
            usage=Usage(),
            tool_calls=0,
            outcome="ok",
            ip_hash="h",
            now=NOW - datetime.timedelta(hours=hours),
        )
    refusal = check_gates(db, "h", NOW)
    assert (refusal.status, refusal.code) == (429, "rate_limited")


def test_client_ip_without_a_socket_peer_is_unknown():
    assert client_ip(make_request({}, client=None)) == "unknown"
