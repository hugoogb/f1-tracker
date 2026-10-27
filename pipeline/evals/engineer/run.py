"""Provider eval for the Race Engineer: which model answers the 30 questions best per dollar.

Throwaway (spec phase 0). Runs the agent loop with the provider protocol the
real build will use, six tools, over questions.json, and prints pass rate,
cost per question and median latency per model.

    uv run --with anthropic --with groq python evals/engineer/run.py --project
    uv run --with anthropic --with groq python evals/engineer/run.py --yes [--models a,b]
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
from typing import Protocol

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parents[1]))

from tools import SPECS, run_tool  # noqa: E402

from src.db.database import SessionLocal  # noqa: E402

MAX_TOKENS = 1200
MAX_TOOL_CALLS = 6

# $ per million tokens. Anthropic: cache write 1.25x input, cache read 0.1x input.
PRICES = {
    "claude-haiku-5-5": {"provider": "anthropic", "in": 0.10, "out": 0.50, "cw": 0.125, "cr": 0.01},
    "claude-sonnet-5-5": {
        "provider": "anthropic",
        "in": 2.00,
        "out": 10.00,
        "cw": 2.50,
        "cr": 0.20,
    },
    "openai/gpt-oss-120b": {"provider": "groq", "in": 0.15, "out": 0.60, "cw": 0.15, "cr": 0.075},
    "openai/gpt-oss-20b": {"provider": "groq", "in": 0.075, "out": 0.30, "cw": 0.075, "cr": 0.0375},
}
DEFAULT_MODELS = [
    "claude-haiku-5-5",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "claude-sonnet-5-5",
]

SYSTEM = """You are the Race Engineer, the assistant of F1 Tracker, a Formula 1 statistics site covering 1950 to today.

Answer questions about drivers, constructors, circuits, seasons, races, standings and records using the tools. Every number, name or result in your answer must come from a tool result in this conversation; never answer from memory, and if the tools cannot answer, say so.

The current season is 2026 and the data runs up to the latest race with results. Standings are the official championship tables. "Champion" means position 1 after a season's final round.

Always end with a link to the page on the site where the user can see more, as a markdown link with a site-relative path from a tool result, e.g. [2021 Monaco Grand Prix](/seasons/2021/races/5). Keep answers to one short paragraph. Use at most a few tool calls."""


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

    def cost(self, model: str) -> float:
        p = PRICES[model]
        return (
            self.input * p["in"]
            + self.output * p["out"]
            + self.cache_write * p["cw"]
            + self.cache_read * p["cr"]
        ) / 1e6


@dataclass
class Turn:
    """One model call: text, requested tool calls, usage, and the raw assistant message to replay."""

    text: str
    tool_calls: list[tuple[str, str, dict]]  # (id, name, args)
    usage: Usage
    raw_assistant: object
    stop: str


class Provider(Protocol):
    def call(self, messages: list) -> Turn: ...
    def tool_result_message(
        self, results: list[tuple[str, str, str]]
    ) -> list: ...  # (id, name, content)
    def user_message(self, text: str) -> dict: ...


class AnthropicProvider:
    def __init__(self, model: str):
        import anthropic

        self.client = anthropic.Anthropic()
        self.model = model
        self.tools = [{**s, "strict": True} for s in SPECS]
        self.tools[-1]["cache_control"] = {"type": "ephemeral"}
        self.system = [{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}]

    def user_message(self, text: str) -> dict:
        return {"role": "user", "content": text}

    def call(self, messages: list) -> Turn:
        r = self.client.messages.create(
            model=self.model,
            max_tokens=MAX_TOKENS,
            system=self.system,
            tools=self.tools,
            tool_choice={"type": "auto"},
            output_config={"effort": "low"},
            messages=messages,
        )
        text = "".join(b.text for b in r.content if b.type == "text")
        calls = [(b.id, b.name, dict(b.input)) for b in r.content if b.type == "tool_use"]
        u = r.usage
        usage = Usage(
            u.input_tokens,
            u.output_tokens,
            u.cache_creation_input_tokens or 0,
            u.cache_read_input_tokens or 0,
        )
        return Turn(text, calls, usage, {"role": "assistant", "content": r.content}, r.stop_reason)

    def tool_result_message(self, results):
        return [
            {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": i, "content": c} for i, _n, c in results
                ],
            }
        ]


class GroqProvider:
    def __init__(self, model: str):
        from groq import Groq

        self.client = Groq()
        self.model = model
        self.tools = [
            {
                "type": "function",
                "function": {
                    "name": s["name"],
                    "description": s["description"],
                    "parameters": s["input_schema"],
                },
            }
            for s in SPECS
        ]

    def user_message(self, text: str) -> dict:
        return {"role": "user", "content": text}

    def call(self, messages: list) -> Turn:
        r = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "system", "content": SYSTEM}, *messages],
            tools=self.tools,
            tool_choice="auto",
            temperature=0.2,
            max_completion_tokens=MAX_TOKENS,
            reasoning_effort="low",
        )
        m = r.choices[0].message
        calls = []
        for tc in m.tool_calls or []:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {"__invalid_json__": tc.function.arguments}
            calls.append((tc.id, tc.function.name, args))
        u = r.usage
        cached = getattr(getattr(u, "prompt_tokens_details", None), "cached_tokens", 0) or 0
        usage = Usage(u.prompt_tokens - cached, u.completion_tokens, 0, cached)
        return Turn(m.content or "", calls, usage, m, r.choices[0].finish_reason)

    def tool_result_message(self, results):
        return [{"role": "tool", "tool_call_id": i, "name": n, "content": c} for i, n, c in results]


def make_provider(model: str) -> Provider:
    kind = PRICES[model]["provider"]
    return AnthropicProvider(model) if kind == "anthropic" else GroqProvider(model)


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


def run_question(provider: Provider, model: str, q: dict) -> Outcome:
    db = SessionLocal()
    messages = [provider.user_message(q["q"])]
    usage, tools_used, calls, text, error = Usage(), [], 0, "", None
    t0 = time.perf_counter()
    try:
        for _ in range(MAX_TOOL_CALLS + 2):
            turn = provider.call(messages)
            usage.add(turn.usage)
            if not turn.tool_calls:
                text = turn.text
                break
            messages.append(turn.raw_assistant)
            results = []
            for cid, name, args in turn.tool_calls:
                calls += 1
                tools_used.append(name)
                if calls > MAX_TOOL_CALLS:
                    results.append(
                        (cid, name, json.dumps({"error": "tool call limit reached; answer now"}))
                    )
                else:
                    results.append((cid, name, run_tool(db, name, args)))
            messages.extend(provider.tool_result_message(results))
        else:
            text = turn.text
            error = "loop exhausted"
    except Exception as e:  # noqa: BLE001
        error = f"{type(e).__name__}: {e}"[:300]
    finally:
        db.close()
    latency = time.perf_counter() - t0
    passed, href_ok, missing = judge(q, text)
    return Outcome(
        q["id"],
        q["tier"],
        passed and not error,
        href_ok,
        missing,
        tools_used,
        calls,
        latency,
        usage.cost(model),
        text,
        error,
        usage,
    )


def project(models: list[str], n: int) -> None:
    """Rough spend before any call: ~2.5 calls/question, growing context, 450 output tokens."""
    import anthropic

    client = anthropic.Anthropic()
    base = client.messages.count_tokens(
        model="claude-haiku-5-5",
        system=SYSTEM,
        tools=[{**s} for s in SPECS],
        messages=[{"role": "user", "content": "Who won the 2021 Monaco Grand Prix?"}],
    ).input_tokens
    print(f"system + tools + question: ~{base} tokens (Anthropic tokenizer)\n")
    print(f"{'model':24} {'$/question':>11} {f'$ for {n}':>10}")
    total = 0.0
    for m in models:
        p = PRICES[m]
        calls = 2.5
        # Each later call re-sends the prefix plus ~1.2k tokens of tool traffic.
        in_tokens = base * calls + 1200 * (calls - 1) * 1.5
        out_tokens = 450
        cost = (in_tokens * p["in"] + out_tokens * p["out"]) / 1e6
        total += cost * n
        print(f"{m:24} {cost:>11.5f} {cost * n:>10.4f}")
    print(f"\nprojected total: ${total:.4f} (Anthropic cache hits would lower it)")


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
    ap.add_argument("--models", default=",".join(DEFAULT_MODELS))
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
    models = [m.strip() for m in args.models.split(",") if m.strip()]
    questions = json.loads((HERE / "questions.json").read_text())
    if args.only:
        keep = {int(x) for x in args.only.split(",")}
        questions = [q for q in questions if q["id"] in keep]

    project(models, len(questions))
    if args.project:
        return
    if not args.yes:
        print("\nre-run with --yes to spend.")
        return

    out_dir = HERE / "results"
    out_dir.mkdir(exist_ok=True)
    summary = []
    for model in models:
        provider = make_provider(model)
        print(f"\n=== {model} ===")
        outcomes: list[Outcome] = []
        for q in questions:
            o = run_question(provider, model, q)
            outcomes.append(o)
            flag = "PASS" if o.passed else "FAIL"
            why = "" if o.passed else f"  missing={o.missing} href_ok={o.href_ok} err={o.error}"
            print(f"  {flag} q{o.id:<2} {o.latency:5.1f}s ${o.cost:.5f} tools={o.tools}{why}")
        n = len(outcomes)
        passed = sum(o.passed for o in outcomes)
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
            "model": model,
            "pass": passed,
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
        summary.append(row)
        (out_dir / f"{model.replace('/', '_')}.json").write_text(
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
    for r in summary:
        c, e = r["by_tier"]["casual"], r["by_tier"]["enthusiast"]
        print(
            f"{r['model']:24} {r['pass']:>3}/{r['n']:<3} {c[0]:>3}/{c[1]:<3} {e[0]:>3}/{e[1]:<3} "
            f"{r['cost_per_q']:>9.5f} {r['cost_total']:>8.4f} {r['latency_median']:>6.1f} {r['latency_p90']:>6.1f} "
            f"{r['tool_calls_avg']:>5.1f} {r['href_rate']:>5.0%} {r['errors']:>3}"
        )
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
