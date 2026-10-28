"""Regression eval for the Race Engineer: the 30 questions against the shipped chat loop.

Drives `src.chat.loop.run_chat` (the real prompt, tools, model adapter and
ledger) and parses its SSE stream, so what is scored is exactly what ships.
Needs ANTHROPIC_API_KEY, CHAT_MODEL, CHAT_IP_SALT and a database.

    uv run python evals/engineer/run.py --project
    uv run python evals/engineer/run.py --yes [--only 1,2]
    uv run python evals/engineer/run.py --rejudge

Every question writes a `chat_usage` row to the configured database.
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parents[1]))

import src.chat.tools  # noqa: E402, F401 - registers every tool
from src.chat.loop import ChatMessage, ChatRequest, run_chat, utcnow  # noqa: E402
from src.chat.prompt import SYSTEM  # noqa: E402
from src.chat.tools.registry import tool_specs  # noqa: E402
from src.config import settings  # noqa: E402
from src.db.database import SessionLocal  # noqa: E402
from src.db.models import ChatUsage  # noqa: E402

MODEL = settings.chat_model
# $ per million tokens, from the same table the ledger prices with.
PRICES = json.loads(settings.chat_prices_json)


@dataclass
class Usage:
    input: int = 0
    output: int = 0
    cache_write: int = 0
    cache_read: int = 0

    def add(self, o: Usage) -> None:
        self.input += o.input
        self.output += o.output
        self.cache_write += o.cache_write
        self.cache_read += o.cache_read


@dataclass
class Outcome:
    id: int
    tier: str
    passed: bool
    href_ok: bool
    missing: list[str]
    tools: list[str]
    calls: int
    latency: float
    cost: float
    answer: str
    error: str | None = None
    usage: Usage = field(default_factory=Usage)


def judge(q: dict, answer: str) -> tuple[bool, bool, list[str]]:
    missing = [pat for pat in q["expect"] if not re.search(pat, answer, re.IGNORECASE)]
    hrefs = q["href"] if isinstance(q["href"], list) else [q["href"]]
    href_ok = any(h in answer for h in hrefs)
    return (not missing and href_ok), href_ok, missing


def parse_sse(frames: list[str]) -> list[tuple[str, dict]]:
    out = []
    for frame in frames:
        event, data = frame.strip().split("\n", 1)
        out.append((event.removeprefix("event: "), json.loads(data.removeprefix("data: "))))
    return out


def run_question(q: dict) -> Outcome:
    db = SessionLocal()
    body = ChatRequest(messages=[ChatMessage(role="user", content=q["q"])], path="/")
    t0 = time.perf_counter()
    frames: list[str] = []
    error = None
    try:
        for frame in run_chat(db, body, ip_hash="eval", now=utcnow()):
            frames.append(frame)
    except Exception as e:  # noqa: BLE001
        error = f"{type(e).__name__}: {e}"[:300]
    latency = time.perf_counter() - t0
    events = parse_sse(frames)
    text = "".join(d["delta"] for e, d in events if e == "text")
    tools_used = [d["name"] for e, d in events if e == "tool"]
    usage, cost = Usage(), 0.0
    done = next((d for e, d in events if e == "done"), None)
    if done is None and error is None:
        error = "no done event"
    if done:
        if done["outcome"] != "ok":
            error = error or f"outcome={done['outcome']}"
        row = db.get(ChatUsage, done["id"])
        if row:
            usage = Usage(
                row.input_tokens, row.output_tokens, row.cache_write_tokens, row.cache_read_tokens
            )
            cost = row.cost_usd
    db.close()
    passed, href_ok, missing = judge(q, text)
    return Outcome(
        q["id"],
        q["tier"],
        passed and not error,
        href_ok,
        missing,
        tools_used,
        len(tools_used),
        latency,
        cost,
        text,
        error,
        usage,
    )


def project(n: int) -> None:
    """Rough spend before any call: ~2.5 calls/question, growing context, 450 output tokens."""
    import anthropic

    client = anthropic.Anthropic()
    base = client.messages.count_tokens(
        model=MODEL,
        system=SYSTEM,
        tools=tool_specs(),
        messages=[{"role": "user", "content": "Who won the 2021 Monaco Grand Prix?"}],
    ).input_tokens
    print(f"system + tools + question: ~{base} tokens (Anthropic tokenizer)\n")
    print(f"{'model':24} {'$/question':>11} {f'$ for {n}':>10}")
    p = PRICES[MODEL]
    calls = 2.5
    # Each later call re-sends the prefix plus ~1.2k tokens of tool traffic.
    in_tokens = base * calls + 1200 * (calls - 1) * 1.5
    cost = (in_tokens * p["input"] + 450 * p["output"]) / 1e6
    print(f"{MODEL:24} {cost:>11.5f} {cost * n:>10.4f}")
    print("\n(upper bound: Anthropic cache hits lower it)")


def rejudge(out_dir: Path, questions: list[dict]) -> None:
    by_id = {q["id"]: q for q in questions}
    for f in sorted(out_dir.glob("*.json")):
        if f.name == "summary.json":
            continue
        d = json.loads(f.read_text())
        rows = d["outcomes"]
        for o in rows:
            passed, href_ok, missing = judge(by_id[o["id"]], o["answer"])
            o["passed"], o["href_ok"], o["missing"] = passed and not o["error"], href_ok, missing
        d["summary"]["pass"] = sum(o["passed"] for o in rows)
        d["summary"]["by_tier"] = {
            t: [
                sum(o["passed"] for o in rows if o["tier"] == t),
                sum(1 for o in rows if o["tier"] == t),
            ]
            for t in ("casual", "enthusiast")
        }
        d["summary"]["href_rate"] = sum(o["href_ok"] for o in rows) / len(rows)
        f.write_text(json.dumps(d, indent=1, default=str))
        r = d["summary"]
        c, e = r["by_tier"]["casual"], r["by_tier"]["enthusiast"]
        print(
            f"{r['model']:24} {r['pass']:>3}/{r['n']:<3} casual {c[0]}/{c[1]} enthusiast {e[0]}/{e[1]} "
            f"$/q {r['cost_per_q']:.5f} med {r['latency_median']}s p90 {r['latency_p90']}s err {r['errors']}"
        )
        for o in rows:
            if not o["passed"]:
                print(
                    f"   FAIL q{o['id']} missing={o['missing']} href_ok={o['href_ok']} err={(o['error'] or '')[:80]}"
                )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", action="store_true", help="print the projected cost and exit")
    ap.add_argument("--yes", action="store_true", help="owner's go-ahead to spend")
    ap.add_argument("--only", type=str, default="", help="comma-separated question ids")
    ap.add_argument(
        "--rejudge",
        action="store_true",
        help="re-score stored answers with the current questions.json, no model calls",
    )
    args = ap.parse_args()
    if args.rejudge:
        rejudge(HERE / "results", json.loads((HERE / "questions.json").read_text()))
        return
    if not settings.chat_enabled:
        sys.exit("chat is not enabled: set ANTHROPIC_API_KEY, CHAT_MODEL and CHAT_IP_SALT")
    questions = json.loads((HERE / "questions.json").read_text())
    if args.only:
        keep = {int(x) for x in args.only.split(",")}
        questions = [q for q in questions if q["id"] in keep]

    project(len(questions))
    if args.project:
        return
    if not args.yes:
        print("\nre-run with --yes to spend.")
        return

    out_dir = HERE / "results"
    out_dir.mkdir(exist_ok=True)
    print(f"\n=== {MODEL} ===")
    outcomes: list[Outcome] = []
    for q in questions:
        o = run_question(q)
        outcomes.append(o)
        flag = "PASS" if o.passed else "FAIL"
        why = "" if o.passed else f"  missing={o.missing} href_ok={o.href_ok} err={o.error}"
        print(f"  {flag} q{o.id:<2} {o.latency:5.1f}s ${o.cost:.5f} tools={o.tools}{why}")
    n = len(outcomes)
    by_tier = {
        t: (
            sum(o.passed for o in outcomes if o.tier == t),
            sum(1 for o in outcomes if o.tier == t),
        )
        for t in ("casual", "enthusiast")
    }
    total_cost = sum(o.cost for o in outcomes)
    usage = Usage()
    for o in outcomes:
        usage.add(o.usage)
    row = {
        "model": MODEL,
        "pass": sum(o.passed for o in outcomes),
        "n": n,
        "by_tier": by_tier,
        "cost_total": round(total_cost, 5),
        "cost_per_q": round(total_cost / n, 6),
        "latency_median": round(statistics.median(o.latency for o in outcomes), 2),
        "latency_p90": round(sorted(o.latency for o in outcomes)[int(0.9 * (n - 1))], 2),
        "tool_calls_avg": round(sum(o.calls for o in outcomes) / n, 2),
        "href_rate": sum(o.href_ok for o in outcomes) / n,
        "errors": sum(1 for o in outcomes if o.error),
        "usage": usage.__dict__,
    }
    (out_dir / f"{MODEL.replace('/', '_')}.json").write_text(
        json.dumps(
            {
                "summary": row,
                "outcomes": [o.__dict__ | {"usage": o.usage.__dict__} for o in outcomes],
            },
            indent=1,
            default=str,
        )
    )

    print("\n=== summary ===")
    print(
        f"{'model':24} {'pass':>7} {'casual':>7} {'enth':>7} {'$/q':>9} {'$ total':>8} {'med s':>6} {'p90 s':>6} {'calls':>5} {'href':>5} {'err':>3}"
    )
    r = row
    c, e = r["by_tier"]["casual"], r["by_tier"]["enthusiast"]
    print(
        f"{r['model']:24} {r['pass']:>3}/{r['n']:<3} {c[0]:>3}/{c[1]:<3} {e[0]:>3}/{e[1]:<3} "
        f"{r['cost_per_q']:>9.5f} {r['cost_total']:>8.4f} {r['latency_median']:>6.1f} {r['latency_p90']:>6.1f} "
        f"{r['tool_calls_avg']:>5.1f} {r['href_rate']:>5.0%} {r['errors']:>3}"
    )
    (out_dir / "summary.json").write_text(json.dumps([row], indent=1))


if __name__ == "__main__":
    main()
