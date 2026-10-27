# Race Engineer Chat Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A chat sidebar ("Engineer") on every page that answers questions from the site's own data through a tool-calling loop on the FastAPI backend, links to the pages that show the detail, and spends a bounded amount of money.

**Architecture:** `POST /api/chat` on FastAPI streams SSE; the loop calls Claude Haiku 5.5 through the official `anthropic` SDK with tools that are thin wrappers over the existing router functions, in-process, with a per-tool SQL statement timeout. A `chat_usage` ledger row (no content) per request is also the budget and rate counter. The Next.js sidebar is a client-only `Sheet` mounted from the header behind `NEXT_PUBLIC_CHAT_ENABLED`, keeping the transcript in `sessionStorage` and sending the last turns as plain text with each request.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic 2, `anthropic` SDK, pytest (SQLite). Next.js 16, React 19, Base UI `Sheet`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-race-engineer-chat-design.md`

## Global Constraints

- Model: `claude-haiku-5-5` via `CHAT_MODEL`; the only provider is Anthropic. No provider protocol, no second adapter, no OpenAI-compatible shim, no AI SDK.
- Anthropic request shape: `client.messages.stream`, `thinking` omitted, `output_config={"effort": "low"}`, `cache_control` on the system block and on the last tool definition, `strict: True` on every tool, `tool_choice` `{"type": "auto"}` (never `any`/`tool`).
- Limits (env, defaults): `CHAT_DAILY_BUDGET_USD=0.50`, `CHAT_IP_PER_10MIN=10`, `CHAT_IP_PER_DAY=60`, `CHAT_MAX_TOKENS=600`; code constants: 20 user turns per conversation, 6 tool calls per turn, last 8 turns sent, ~12k input-token soft cap, 5 s statement timeout per tool.
- Client IP is the `Cf-Connecting-Ip` header; `request.client.host` only when the header is absent (local dev). `X-Forwarded-For` is never read.
- The ledger stores no content: never a question, answer, path, page title, raw IP or error message.
- Tool payloads are compact: top 10 rows plus the named entity, `href` fields, serialized JSON under 6,000 characters (~1.5k tokens).
- Every number in an answer comes from a tool; the system prompt forbids answering from memory. The current date and page context go in the user turn, never in the system block.
- The header fetches nothing and the cached pages carry only the button; the sheet body is `dynamic()`-imported with `ssr: false`.
- Dark-only telemetry UI: design tokens only, `Tag` for the status line, `label` font for readouts.
- Never read `request.client.host` behind the proxy; never add `TileLayer`, image sources or a second colour palette (unchanged project rules).
- Conventional commits; `uv run ruff check . && uv run ruff format --check .` and `uv run pytest` green in `pipeline/`; `pnpm lint`, `pnpm test`, `pnpm build` green in `apps/web/`.

## Review Focus

1. An empty or whitespace-only question, or a body whose last message is not a `user` turn, must return 400 without calling the model or writing a ledger row of cost (Task 8 tests).
2. The model calling an unknown tool, or a known tool with arguments that fail validation, must get an error tool result and the loop must continue to a text answer (Task 5 and Task 8 tests).
3. `navigate` with an external or protocol-relative href (`https://x`, `//x`) must never reach the client as a `navigate` event; the model gets a refusal result (Task 5 test; Task 10 test on the client-side guard).
4. The client disconnecting mid-stream must still write the ledger row with the usage seen so far, so the budget cannot be bypassed by aborting (Task 8 test).
5. A request through the proxy with a forged `X-Forwarded-For` must be keyed on `Cf-Connecting-Ip`; a request with no `Cf-Connecting-Ip` (local dev) uses the socket address (Task 3 test).

---

### Task 1: Settings, dependency, CORS and env documentation

**Files:**
- Modify: `pipeline/pyproject.toml` (dependencies)
- Modify: `pipeline/src/config.py`
- Modify: `pipeline/src/api/main.py:38-44` (CORS methods)
- Modify: `docker/.env.prod.example`, `.env.example`, `docs/DEPLOYMENT.md:83-100` (env tables)
- Test: `pipeline/tests/test_chat_config.py`

**Interfaces:**
- Produces: `settings.anthropic_api_key: str = ""`, `settings.chat_model: str = ""`, `settings.chat_ip_salt: str = ""`, `settings.chat_daily_budget_usd: float = 0.50`, `settings.chat_ip_per_10min: int = 10`, `settings.chat_ip_per_day: int = 60`, `settings.chat_max_tokens: int = 600`, `settings.chat_prices_json: str` (default `{"claude-haiku-5-5": {"input": 0.10, "output": 0.50, "cache_write": 0.125, "cache_read": 0.01}}`, dollars per million tokens), and `settings.chat_enabled -> bool` (a property: key, model and salt all non-empty).

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_chat_config.py
from src.config import Settings

def test_chat_is_disabled_until_key_model_and_salt_are_all_set():
    assert Settings(_env_file=None).chat_enabled is False
    assert Settings(_env_file=None, anthropic_api_key="k", chat_model="claude-haiku-5-5").chat_enabled is False
    assert Settings(_env_file=None, anthropic_api_key="k", chat_model="claude-haiku-5-5", chat_ip_salt="s").chat_enabled is True

def test_chat_limit_defaults_match_the_spec():
    s = Settings(_env_file=None)
    assert (s.chat_daily_budget_usd, s.chat_ip_per_10min, s.chat_ip_per_day, s.chat_max_tokens) == (0.50, 10, 60, 600)
    assert '"claude-haiku-5-5"' in s.chat_prices_json
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_chat_config.py -v`
Expected: FAIL with `AttributeError: 'Settings' object has no attribute 'chat_enabled'`

- [ ] **Step 3: Add the settings fields and `chat_enabled` property to `Settings` in `src/config.py`; add `"anthropic>=0.70"` to `dependencies` in `pyproject.toml` and run `uv lock`; change `allow_methods` in `src/api/main.py` to `["GET", "POST", "OPTIONS"]`**

- [ ] **Step 4: Run the tests to verify they pass, then the full suite**

Run: `cd pipeline && uv run pytest tests/test_chat_config.py -v && uv run pytest -q`
Expected: PASS; full suite green

- [ ] **Step 5: Document the keys**

Add to `docker/.env.prod.example` a `# --- Race Engineer chat ---` block: `ANTHROPIC_API_KEY=`, `CHAT_MODEL=claude-haiku-5-5`, `CHAT_IP_SALT=` (comment: `openssl rand -hex 32`; hashes client IPs per day; chat stays off until all three are set), `CHAT_DAILY_BUDGET_USD=0.50`, `CHAT_IP_PER_10MIN=10`, `CHAT_IP_PER_DAY=60`, `CHAT_MAX_TOKENS=600`, commented `#CHAT_PRICES_JSON=`. Add the same keys to `.env.example` (empty key, chat off by default) and `NEXT_PUBLIC_CHAT_ENABLED=` with a comment that `true` shows the button. Add one row per key to the VPS env table in `docs/DEPLOYMENT.md`.

- [ ] **Step 6: Commit**

```bash
git add pipeline/pyproject.toml pipeline/uv.lock pipeline/src/config.py pipeline/src/api/main.py pipeline/tests/test_chat_config.py docker/.env.prod.example .env.example docs/DEPLOYMENT.md
git commit -m "feat(chat): settings, anthropic dependency and CORS POST for the Engineer"
```

---

### Task 2: Ledger model, migration and ledger functions

**Files:**
- Modify: `pipeline/src/db/models.py` (after `IngestRun`)
- Create: `pipeline/alembic/versions/a1c4e7b2d905_add_chat_usage.py`
- Create: `pipeline/src/chat/__init__.py` (empty), `pipeline/src/chat/ledger.py`
- Test: `pipeline/tests/test_chat_ledger.py`

**Interfaces:**
- Produces: model `ChatUsage` (`__tablename__ = "chat_usage"`): `id: str` (uuid, `new_uuid` default), `created_at: datetime` (tz-aware, indexed), `model: str`, `provider: str` (`"anthropic"`), `input_tokens: int`, `output_tokens: int`, `cache_write_tokens: int`, `cache_read_tokens: int`, `cost_usd: float`, `tool_calls: int`, `outcome: str` (`ok | budget | rate_limited | error`), `ip_hash: str` (indexed with `created_at`), `thumbs: int | None`.
- Produces in `src/chat/ledger.py`:
  - `@dataclass Usage(input_tokens: int = 0, output_tokens: int = 0, cache_write_tokens: int = 0, cache_read_tokens: int = 0)` with `add(other: Usage) -> None`
  - `ip_hash(ip: str, day: date, salt: str) -> str` — HMAC-SHA256 hex of `ip` with key `f"{salt}:{day.isoformat()}"`
  - `cost_of(model: str, usage: Usage) -> float` — from `settings.chat_prices_json`; unknown model raises `KeyError`
  - `day_start(now: datetime) -> datetime` — midnight UTC of `now`'s date
  - `spent_today(db: Session, now: datetime) -> float` — `SUM(cost_usd)` since `day_start`
  - `requests_since(db: Session, ip_hash: str, since: datetime) -> int`
  - `record(db: Session, *, model: str, usage: Usage, tool_calls: int, outcome: str, ip_hash: str, now: datetime) -> ChatUsage` — computes cost, inserts, commits, returns the row
  - `set_thumbs(db: Session, row_id: str, thumbs: int) -> bool` — `True` if a row was updated

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_chat_ledger.py
import datetime
from src.chat.ledger import Usage, cost_of, day_start, ip_hash, record, requests_since, set_thumbs, spent_today

UTC = datetime.UTC
NOW = datetime.datetime(2026, 10, 26, 15, 0, tzinfo=UTC)

def test_ip_hash_rotates_with_the_day_and_the_salt():
    a = ip_hash("203.0.113.9", NOW.date(), "salt")
    assert a == ip_hash("203.0.113.9", NOW.date(), "salt")
    assert a != ip_hash("203.0.113.9", NOW.date() + datetime.timedelta(days=1), "salt")
    assert a != ip_hash("203.0.113.9", NOW.date(), "other")
    assert "203.0.113.9" not in a and len(a) == 64

def test_cost_uses_the_price_table_per_million_tokens():
    u = Usage(input_tokens=1_000_000, output_tokens=1_000_000, cache_write_tokens=1_000_000, cache_read_tokens=1_000_000)
    assert cost_of("claude-haiku-5-5", u) == 0.10 + 0.50 + 0.125 + 0.01

def test_spent_today_sums_only_rows_since_midnight_utc(db):
    yesterday = NOW - datetime.timedelta(days=1)
    record(db, model="claude-haiku-5-5", usage=Usage(output_tokens=2_000_000), tool_calls=0, outcome="ok", ip_hash="h", now=yesterday)
    record(db, model="claude-haiku-5-5", usage=Usage(output_tokens=1_000_000), tool_calls=1, outcome="ok", ip_hash="h", now=NOW)
    assert spent_today(db, NOW) == 0.50
    assert day_start(NOW) == datetime.datetime(2026, 10, 26, tzinfo=UTC)

def test_requests_since_counts_refused_rows_too(db):
    for outcome in ("ok", "rate_limited", "budget"):
        record(db, model="claude-haiku-5-5", usage=Usage(), tool_calls=0, outcome=outcome, ip_hash="h", now=NOW)
    record(db, model="claude-haiku-5-5", usage=Usage(), tool_calls=0, outcome="ok", ip_hash="other", now=NOW)
    assert requests_since(db, "h", NOW - datetime.timedelta(minutes=10)) == 3

def test_set_thumbs_updates_an_existing_row_only(db):
    row = record(db, model="claude-haiku-5-5", usage=Usage(), tool_calls=0, outcome="ok", ip_hash="h", now=NOW)
    assert set_thumbs(db, row.id, 1) is True
    assert set_thumbs(db, "missing", -1) is False
    db.refresh(row)
    assert row.thumbs == 1
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_chat_ledger.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.chat'`

- [ ] **Step 3: Add `ChatUsage` to `src/db/models.py` with a docstring stating the no-content rule, then write `src/chat/ledger.py` per the Interfaces block**

Date filters compare `ChatUsage.created_at >= day_start(now)` (a Python-computed bound, portable to SQLite). `cost_of` reads `json.loads(settings.chat_prices_json)[model]` and multiplies each token count by its rate over 1,000,000.

- [ ] **Step 4: Write the migration**

`alembic/versions/a1c4e7b2d905_add_chat_usage.py`: `revision = "a1c4e7b2d905"`, `down_revision = "f3a7c1d9e204"`; `upgrade()` creates `chat_usage` with the columns above (`created_at` as `sa.DateTime(timezone=True)`), index `ix_chat_usage_created_at` and `ix_chat_usage_ip_hash_created_at`; `downgrade()` drops them. Docstring: what the table is for and that it never holds content.

- [ ] **Step 5: Run the tests to verify they pass, then the suite and the migration check**

Run: `cd pipeline && uv run pytest tests/test_chat_ledger.py -v && uv run pytest -q && uv run alembic heads`
Expected: PASS; one head `a1c4e7b2d905`

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/db/models.py pipeline/alembic/versions/a1c4e7b2d905_add_chat_usage.py pipeline/src/chat/__init__.py pipeline/src/chat/ledger.py pipeline/tests/test_chat_ledger.py
git commit -m "feat(chat): chat_usage ledger model, migration and counters"
```

---

### Task 3: Client IP and the gates

**Files:**
- Create: `pipeline/src/chat/gates.py`
- Modify: `docs/DEPLOYMENT.md` (new subsection after "3. Reverse proxy")
- Test: `pipeline/tests/test_chat_gates.py`

**Interfaces:**
- Consumes: `ledger.spent_today`, `ledger.requests_since`, `ledger.day_start`, settings from Task 1.
- Produces in `src/chat/gates.py`:
  - `client_ip(request: Request) -> str` — `Cf-Connecting-Ip` header if present, else `request.client.host` (or `"unknown"` when `request.client` is `None`)
  - `@dataclass Refusal(status: int, code: str, message: str)` with `code in {"budget", "rate_limited"}`
  - `check_gates(db: Session, ip_hash: str, now: datetime) -> Refusal | None` — budget first (`spent_today >= settings.chat_daily_budget_usd` → `Refusal(503, "budget", "Off the radio until tomorrow.")`), then rate (`requests_since(ip_hash, now - 10 min) >= chat_ip_per_10min` or `requests_since(ip_hash, day_start(now)) >= chat_ip_per_day` → `Refusal(429, "rate_limited", "Take a breath; try again in a few minutes.")`)

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_chat_gates.py
import datetime
from fastapi import Request
from src.chat.gates import check_gates, client_ip
from src.chat.ledger import Usage, record
from src.config import settings

UTC = datetime.UTC
NOW = datetime.datetime(2026, 10, 26, 15, 0, tzinfo=UTC)

def make_request(headers: dict[str, str], client=("10.0.0.1", 1234)) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    return Request({"type": "http", "method": "POST", "path": "/api/chat", "headers": raw, "client": client, "query_string": b""})

def test_client_ip_reads_cf_connecting_ip_and_ignores_x_forwarded_for():
    req = make_request({"Cf-Connecting-Ip": "198.51.100.7", "X-Forwarded-For": "203.0.113.9, 198.51.100.7"})
    assert client_ip(req) == "198.51.100.7"

def test_client_ip_falls_back_to_the_socket_without_the_header():
    assert client_ip(make_request({"X-Forwarded-For": "203.0.113.9"})) == "10.0.0.1"

def test_budget_gate_refuses_with_503_once_the_day_is_spent(db, monkeypatch):
    monkeypatch.setattr(settings, "chat_daily_budget_usd", 0.50)
    record(db, model="claude-haiku-5-5", usage=Usage(output_tokens=1_000_000), tool_calls=0, outcome="ok", ip_hash="x", now=NOW)
    refusal = check_gates(db, "h", NOW)
    assert (refusal.status, refusal.code) == (503, "budget")

def test_rate_gate_refuses_with_429_after_ten_in_ten_minutes(db, monkeypatch):
    monkeypatch.setattr(settings, "chat_ip_per_10min", 10)
    for _ in range(10):
        record(db, model="claude-haiku-5-5", usage=Usage(), tool_calls=0, outcome="ok", ip_hash="h", now=NOW - datetime.timedelta(minutes=5))
    assert check_gates(db, "h", NOW).status == 429
    assert check_gates(db, "someone-else", NOW) is None

def test_rate_gate_window_is_ten_minutes(db, monkeypatch):
    monkeypatch.setattr(settings, "chat_ip_per_10min", 1)
    monkeypatch.setattr(settings, "chat_ip_per_day", 60)
    record(db, model="claude-haiku-5-5", usage=Usage(), tool_calls=0, outcome="ok", ip_hash="h", now=NOW - datetime.timedelta(minutes=11))
    assert check_gates(db, "h", NOW) is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_chat_gates.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.chat.gates'`

- [ ] **Step 3: Implement `client_ip` and `check_gates` in `src/chat/gates.py`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd pipeline && uv run pytest tests/test_chat_gates.py -v`
Expected: PASS

- [ ] **Step 5: Add the Cloudflare section to `docs/DEPLOYMENT.md`**

New subsection "3a. Cloudflare rate limiting for the chat" after "3. Reverse proxy": the API hostname is proxied by Cloudflare; add one free-plan rate-limiting rule for `POST` on path `/api/chat`, 20 requests per 10 minutes per IP, action Block; note that the API reads `Cf-Connecting-Ip` for its own per-IP limits, so the origin must stay reachable only through Cloudflare.

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/chat/gates.py pipeline/tests/test_chat_gates.py docs/DEPLOYMENT.md
git commit -m "feat(chat): client IP from Cf-Connecting-Ip, budget and rate gates"
```

---

### Task 4: Events and the Anthropic model client

**Files:**
- Create: `pipeline/src/chat/events.py`, `pipeline/src/chat/model.py`
- Test: `pipeline/tests/test_chat_model.py`

**Interfaces:**
- Produces in `src/chat/events.py`: frozen dataclasses `TextDelta(text: str)`, `ToolCall(id: str, name: str, args: dict)`, `UsageEvent(usage: Usage)` (the ledger `Usage`), `Done(stop_reason: str, content: list)` where `content` is the raw assistant content blocks (as `dict`s via `block.model_dump()`) to replay in the next turn; `Event = TextDelta | ToolCall | UsageEvent | Done`.
- Produces in `src/chat/model.py`:
  - `class ToolSpec(TypedDict): name: str; description: str; input_schema: dict`
  - `Message = dict[str, Any]` (an Anthropic `MessageParam`)
  - `def stream_turn(*, system: str, tools: list[ToolSpec], messages: list[Message], max_tokens: int, tool_choice: dict | None = None) -> Iterator[Event]`
  - `def _client() -> anthropic.Anthropic` — module-level factory (`anthropic.Anthropic(api_key=settings.anthropic_api_key)`), the seam tests monkeypatch.
- Request built by `stream_turn`: `model=settings.chat_model`, `max_tokens`, `system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]`, `tools=[{**spec, "strict": True} for spec]` with `cache_control` added to the last one, `tool_choice=tool_choice or {"type": "auto"}`, `output_config={"effort": "low"}`, `messages`. No `thinking` key.
- Streaming: `with client.messages.stream(**kwargs) as stream: for event in stream:` yield `TextDelta(event.text)` for `event.type == "text"`; then `final = stream.get_final_message()`; yield one `ToolCall` per `tool_use` block (`block.id`, `block.name`, `dict(block.input)`), then `UsageEvent(Usage(final.usage.input_tokens, final.usage.output_tokens, final.usage.cache_creation_input_tokens or 0, final.usage.cache_read_input_tokens or 0))`, then `Done(final.stop_reason, [b.model_dump() for b in final.content])`.

- [ ] **Step 1: Write the failing tests with a fake SDK stream**

```python
# tests/test_chat_model.py
from types import SimpleNamespace
import pytest
from src.chat import model as chat_model
from src.chat.events import Done, TextDelta, ToolCall, UsageEvent

class FakeStream:
    def __init__(self, events, final):
        self._events, self._final = events, final
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def __iter__(self): return iter(self._events)
    def get_final_message(self): return self._final

class Block(SimpleNamespace):
    def model_dump(self): return dict(vars(self))

@pytest.fixture
def captured(monkeypatch):
    calls = {}
    text_events = [SimpleNamespace(type="text", text="Max "), SimpleNamespace(type="text", text="leads.")]
    final = SimpleNamespace(
        stop_reason="tool_use",
        content=[Block(type="text", text="Max leads."), Block(type="tool_use", id="tu_1", name="get_standings", input={"year": 2024, "kind": "drivers", "focus_ref": None})],
        usage=SimpleNamespace(input_tokens=1500, output_tokens=40, cache_creation_input_tokens=1200, cache_read_input_tokens=None),
    )
    def stream(**kwargs):
        calls.update(kwargs)
        return FakeStream(text_events, final)
    monkeypatch.setattr(chat_model, "_client", lambda: SimpleNamespace(messages=SimpleNamespace(stream=stream)))
    monkeypatch.setattr(chat_model.settings, "chat_model", "claude-haiku-5-5")
    return calls

TOOLS = [
    {"name": "search", "description": "d", "input_schema": {"type": "object", "properties": {"q": {"type": "string"}}, "required": ["q"], "additionalProperties": False}},
    {"name": "get_standings", "description": "d", "input_schema": {"type": "object", "properties": {}, "required": [], "additionalProperties": False}},
]

def test_stream_turn_yields_text_then_tool_calls_usage_and_done(captured):
    events = list(chat_model.stream_turn(system="S", tools=TOOLS, messages=[{"role": "user", "content": "q"}], max_tokens=600))
    assert events[:2] == [TextDelta("Max "), TextDelta("leads.")]
    assert events[2] == ToolCall("tu_1", "get_standings", {"year": 2024, "kind": "drivers", "focus_ref": None})
    usage = next(e for e in events if isinstance(e, UsageEvent)).usage
    assert (usage.input_tokens, usage.output_tokens, usage.cache_write_tokens, usage.cache_read_tokens) == (1500, 40, 1200, 0)
    done = events[-1]
    assert isinstance(done, Done) and done.stop_reason == "tool_use" and done.content[1]["name"] == "get_standings"

def test_request_shape_matches_the_spec(captured):
    list(chat_model.stream_turn(system="S", tools=TOOLS, messages=[{"role": "user", "content": "q"}], max_tokens=600))
    assert captured["model"] == "claude-haiku-5-5"
    assert captured["max_tokens"] == 600
    assert captured["system"] == [{"type": "text", "text": "S", "cache_control": {"type": "ephemeral"}}]
    assert captured["output_config"] == {"effort": "low"}
    assert captured["tool_choice"] == {"type": "auto"}
    assert "thinking" not in captured
    assert all(t["strict"] is True for t in captured["tools"])
    assert "cache_control" not in captured["tools"][0] and captured["tools"][-1]["cache_control"] == {"type": "ephemeral"}

def test_tool_choice_can_be_forced_off_for_the_final_turn(captured):
    list(chat_model.stream_turn(system="S", tools=TOOLS, messages=[{"role": "user", "content": "q"}], max_tokens=600, tool_choice={"type": "none"}))
    assert captured["tool_choice"] == {"type": "none"}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_chat_model.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.chat.events'`

- [ ] **Step 3: Implement `src/chat/events.py` and `src/chat/model.py` per the Interfaces block**

The tool dicts passed to the SDK must be fresh copies (`{**spec, "strict": True}`) so `cache_control` is never written onto the shared spec list.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd pipeline && uv run pytest tests/test_chat_model.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/chat/events.py pipeline/src/chat/model.py pipeline/tests/test_chat_model.py
git commit -m "feat(chat): streaming Anthropic client with the spec's request shape"
```

---

### Task 5: Tool registry, argument validation, statement timeout, `search`, `site_map`, `navigate`

**Files:**
- Create: `pipeline/src/chat/constants.py`, `pipeline/src/chat/tools/__init__.py`, `pipeline/src/chat/tools/registry.py`, `pipeline/src/chat/tools/site.py`
- Test: `pipeline/tests/test_chat_tools_site.py`

**Interfaces:**
- Produces in `src/chat/constants.py`: `MAX_TOOL_CALLS = 6`, `HISTORY_TURNS = 8`, `MAX_CONVERSATION_TURNS = 20`, `INPUT_SOFT_CAP_TOKENS = 12_000`, `STATEMENT_TIMEOUT_MS = 5_000`, `MAX_TOOL_RESULT_CHARS = 6_000`, `TOP_N = 10`, `NAVIGATE = "navigate"`.
- Produces in `src/chat/tools/registry.py`:
  - `@dataclass(frozen=True) Tool(name: str, description: str, args: type[BaseModel], run: Callable[[Session, BaseModel], dict], label: Callable[[BaseModel], str])`
  - `register(tool: Tool) -> Tool` and `TOOLS: dict[str, Tool]`
  - `strict_schema(model: type[BaseModel]) -> dict` — Pydantic JSON schema with every property listed in `required`, `additionalProperties: False`, and `anyOf: [{type: X}, {type: "null"}]` rewritten to `type: [X, "null"]` (what Anthropic strict mode accepts; optional args are therefore typed nullable and always present)
  - `tool_specs() -> list[ToolSpec]` — every registered tool in registration order, `navigate` last
  - `run_tool(db: Session, name: str, raw_args: dict) -> str` — validates with `Tool.args(**raw_args)` (`extra="forbid"`); on `ValidationError` or unknown name returns `json.dumps({"error": "..."})`; otherwise runs inside `SET LOCAL statement_timeout` (only when `db.get_bind().dialect.name == "postgresql"`), serializes with `json.dumps(result, default=str)`, truncates to `MAX_TOOL_RESULT_CHARS` with a `"truncated": true` marker if longer, and always calls `db.rollback()` afterwards (read-only). Exceptions from a tool become `{"error": "<type>: <message>"[:300]}`.
  - `tool_label(name: str, raw_args: dict) -> str` — the status-tag label (`"2024 standings"`, `"search: hamilton"`); `"working"` if args fail to validate.
- Produces in `src/chat/tools/site.py` (registered tools):
  - `search(q: str)` → `{"drivers": [{name, ref, nationality, href}], "constructors": [{name, ref, href}], "circuits": [{name, ref, country, href}], "seasons": [{year, href}], "races": [{year, round, name, date, href}]}` wrapping `src.api.routers.search.search(q=..., db=db)`
  - `site_map()` → `{"pages": [{title, href, shows}]}` from a static `SITE_PAGES` list covering every route in the CLAUDE.md routes table (templated hrefs like `/seasons/{year}/races/{round}`)
  - `navigate(href: str)` → `{"navigated": true, "href": href}` when `href.startswith("/") and not href.startswith("//")`, else `{"error": "only site paths can be opened"}`; the loop (Task 8) is what emits the client event — this function does no I/O
- Consumes: `ToolSpec` from Task 4.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_chat_tools_site.py
import json
from src.chat.constants import MAX_TOOL_RESULT_CHARS
from src.chat.tools.registry import TOOLS, run_tool, strict_schema, tool_label, tool_specs
from src.chat.tools import site  # noqa: F401 - registers

def test_every_spec_is_strict_mode_ready():
    for spec in tool_specs():
        schema = spec["input_schema"]
        assert schema["additionalProperties"] is False
        assert sorted(schema["required"]) == sorted(schema["properties"])
        assert "anyOf" not in json.dumps(schema)

def test_navigate_is_the_last_tool_so_the_cache_breakpoint_sits_on_it():
    assert tool_specs()[-1]["name"] == "navigate"

def test_search_returns_compact_rows_with_hrefs(db, seed_data):
    out = json.loads(run_tool(db, "search", {"q": "verstappen"}))
    assert out["drivers"] == [{"name": "Max Verstappen", "ref": "max_verstappen", "nationality": "Dutch", "href": "/drivers/max_verstappen"}]
    assert len(json.dumps(out)) < MAX_TOOL_RESULT_CHARS

def test_site_map_covers_the_records_and_compare_pages(db):
    hrefs = {p["href"] for p in json.loads(run_tool(db, "site_map", {}))["pages"]}
    assert {"/", "/records", "/compare/drivers", "/seasons/{year}/races/{round}", "/status"} <= hrefs

def test_unknown_tool_and_invalid_args_become_error_results(db):
    assert "error" in json.loads(run_tool(db, "nope", {}))
    assert "error" in json.loads(run_tool(db, "search", {"q": 5, "extra": 1}))

def test_navigate_refuses_external_and_protocol_relative_hrefs(db):
    assert json.loads(run_tool(db, "navigate", {"href": "/seasons/2021/races/22"})) == {"navigated": True, "href": "/seasons/2021/races/22"}
    assert "error" in json.loads(run_tool(db, "navigate", {"href": "https://example.com"}))
    assert "error" in json.loads(run_tool(db, "navigate", {"href": "//example.com"}))

def test_tool_label_is_short_and_never_raises():
    assert tool_label("search", {"q": "hamilton"}) == "search: hamilton"
    assert tool_label("search", {"q": 5}) == "working"

def test_a_tool_exception_is_returned_not_raised(db, monkeypatch):
    from dataclasses import replace
    def boom(db, args): raise RuntimeError("db down")
    monkeypatch.setitem(TOOLS, "search", replace(TOOLS["search"], run=boom))
    assert json.loads(run_tool(db, "search", {"q": "x"}))["error"].startswith("RuntimeError")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_chat_tools_site.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.chat.constants'`

- [ ] **Step 3: Implement `constants.py`, `tools/registry.py` and `tools/site.py`**

`tools/__init__.py` imports every tool module (`site`, and the modules from Tasks 6 and 7 as they land) so importing the package registers all tools. Port `search`, `site_map` and the schema helper from `pipeline/evals/engineer/tools.py`, then extend `SITE_PAGES` to every route in the CLAUDE.md table.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd pipeline && uv run pytest tests/test_chat_tools_site.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/chat/constants.py pipeline/src/chat/tools pipeline/tests/test_chat_tools_site.py
git commit -m "feat(chat): tool registry with strict schemas, statement timeout, search, site_map and navigate"
```

---

### Task 6: Season tools

**Files:**
- Create: `pipeline/src/chat/tools/seasons.py`
- Modify: `pipeline/src/chat/tools/__init__.py` (import)
- Test: `pipeline/tests/test_chat_tools_seasons.py`

**Interfaces:**
- Consumes: `register`, `Tool`, `TOP_N` from Task 5; router functions `src.api.routers.seasons.get_season(year, db)`, `get_season_calendar(year, db)`, `src.api.routers.standings.driver_standings(year, db)`, `constructor_standings(year, db)`, `standings_progression(year, top, db)`, `constructor_standings_progression(...)`, `title_permutations(year, db)`, `constructor_title_permutations(year, db)` — each called with every argument passed explicitly (never a `Query` default).
- Produces registered tools (args → compact dict, each with `"href"`):
  - `get_season(year: int)` → `{year, href: "/seasons/{year}", rounds, completedRounds, champion: {name, ref, href} | None, constructorsChampion: {...} | None, scoring: {system, allResultsCounted, note}}` (scoring text from the season's `scoring` block)
  - `get_standings(year: int, kind: Literal["drivers", "constructors"], focus_ref: str | None)` → `{year, kind, asOfRound: {round, name, date, href}, note, standings: [{position, name, ref, constructor?, points, dropped?, wins, href}]}` — top 10 plus the `focus_ref` row if it is outside the top 10; `note` states "official championship table after that round; `dropped` is what the best-N rule removed"
  - `get_progression(year: int, kind: Literal["drivers", "constructors"])` → `{year, kind, href, leaderAfterRound: [{round, leader, ref, points}], leadChanges: int}`
  - `get_title_permutations(year: int, kind: Literal["drivers", "constructors"])` → `{year, kind, href, decided: bool, roundsRemaining, contenders: [{name, ref, points, maxPoints, needs}]}` trimmed from the permutations payload
  - `get_calendar(year: int)` → `{year, href, totalKm, rounds: [{round, name, circuit, country, date, winner: {name, ref} | None, href}]}` (every round; a season is at most ~24 rows)
- Labels: `"{year} standings"`, `"{year} season"`, `"{year} progression"`, `"{year} title permutations"`, `"{year} calendar"`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_chat_tools_seasons.py
import json
from src.chat.constants import MAX_TOOL_RESULT_CHARS
from src.chat.tools.registry import run_tool, tool_label
import src.chat.tools  # noqa: F401

def test_get_standings_is_the_official_table_with_hrefs(db, seed_data):
    out = json.loads(run_tool(db, "get_standings", {"year": 2023, "kind": "drivers", "focus_ref": None}))
    assert out["href"] == "/seasons/2023"
    row = out["standings"][0]
    assert {"position", "name", "ref", "points", "wins", "href"} <= set(row)
    assert row["href"] == f"/drivers/{row['ref']}"
    assert "official" in out["note"]
    assert len(json.dumps(out)) < MAX_TOOL_RESULT_CHARS

def test_get_standings_caps_at_ten_rows_plus_the_focused_entity(db, seed_data):
    out = json.loads(run_tool(db, "get_standings", {"year": 2023, "kind": "drivers", "focus_ref": "max_verstappen"}))
    assert len(out["standings"]) <= 11
    assert any(r["ref"] == "max_verstappen" for r in out["standings"])
    ignored = json.loads(run_tool(db, "get_standings", {"year": 2023, "kind": "drivers", "focus_ref": "nobody"}))
    assert "error" not in ignored  # an unknown focus ref is ignored, not an error

def test_get_season_names_the_champion_and_scoring(db, seed_data):
    out = json.loads(run_tool(db, "get_season", {"year": 2023}))
    assert out["href"] == "/seasons/2023" and "scoring" in out and "rounds" in out

def test_get_calendar_lists_every_round_with_a_race_href(db, seed_data):
    out = json.loads(run_tool(db, "get_calendar", {"year": 2023}))
    assert out["rounds"][0]["href"] == "/seasons/2023/races/1"

def test_progression_and_permutations_answer_for_a_seeded_season(db, seed_data):
    prog = json.loads(run_tool(db, "get_progression", {"year": 2023, "kind": "drivers"}))
    assert "leaderAfterRound" in prog and "leadChanges" in prog
    perm = json.loads(run_tool(db, "get_title_permutations", {"year": 2023, "kind": "drivers"}))
    assert "contenders" in perm and perm["href"] == "/seasons/2023"

def test_unknown_season_is_an_error_result_not_a_404(db):
    assert "error" in json.loads(run_tool(db, "get_season", {"year": 1930}))

def test_labels():
    assert tool_label("get_standings", {"year": 2024, "kind": "drivers", "focus_ref": None}) == "2024 standings"
```

Adjust the `seed_data`/`race_seed_data` expectations to what `tests/conftest.py` actually seeds (read it first); keep the assertions on shape, hrefs and size.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_chat_tools_seasons.py -v`
Expected: FAIL with `error` results for unknown tools (`"unknown tool get_standings"`)

- [ ] **Step 3: Implement `tools/seasons.py`; import it from `tools/__init__.py`**

`HTTPException` from a router (404) is caught by `run_tool` already (Task 5) and becomes an error result; `get_season` maps a missing year to `{"error": "no season {year}"}` explicitly so the message is useful to the model.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd pipeline && uv run pytest tests/test_chat_tools_seasons.py tests/test_standings.py tests/test_permutations.py -v`
Expected: PASS (the router tests prove the wrapped endpoints are untouched)

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/chat/tools/seasons.py pipeline/src/chat/tools/__init__.py pipeline/tests/test_chat_tools_seasons.py
git commit -m "feat(chat): season, standings, progression, permutations and calendar tools"
```

---

### Task 7: Race, entity, records and comparison tools

**Files:**
- Create: `pipeline/src/chat/tools/races.py`, `pipeline/src/chat/tools/entities.py`, `pipeline/src/chat/tools/records.py`, `pipeline/src/chat/tools/compare.py`
- Modify: `pipeline/src/chat/tools/__init__.py`
- Test: `pipeline/tests/test_chat_tools_data.py`

**Interfaces:**
- Consumes: Task 5 registry; routers `races.get_race/get_qualifying/get_sprint/get_pitstops`, `drivers.get_driver`, `constructors.get_constructor/get_constructor_lineage`, `circuits.get_circuit/get_circuit_stats`, `records.explore_records` (all args explicit), `champions.list_champions`, `best_seasons.best_seasons` (all args explicit), `compare.compare_drivers(d1, d2, teammate, db)`, `compare.compare_constructors(c1, c2, db)`, `season_compare.season_compare_drivers/constructors`.
- Produces registered tools:
  - `get_race(year: int, round: int, section: Literal["results", "qualifying", "sprint", "pitstops"])` → `{year, round, name, date, circuit: {name, country, href}, href: "/seasons/{year}/races/{round}", section, fastestLap?, rows: [...top 10...], coverage?}` — `pitstops` rows carry `timeLost` against the race benchmark, never absolute buckets
  - `get_driver(ref: str)` → `{name, ref, code, nationality, dateOfBirth, href, career: {starts, wins, podiums, poles, fastestLaps, championships, points}}`
  - `get_constructor(ref: str)` → `{name, ref, nationality, href, career: {...}, lineage: [{name, ref, years, href}]}` with the note "a lineage is a chain of entries, not one team"
  - `get_circuit(ref: str)` → `{name, ref, location, country, href, races: int, firstYear, lastYear, mostWins: [{name, ref, wins}]}`
  - `get_records(entity: Literal["driver", "constructor"], category: Literal[<the nine ExploreCategory values>], year_from: int | None, year_to: int | None, nationality: str | None, min_starts: int | None, limit: int)` → `{entity, category, label, yearFrom, yearTo, nationality, minStarts, href: "/records", note, rows: [{rank, name, ref, value, starts, href}]}` (limit clamped to 1..25)
  - `get_champions(year_from: int | None, year_to: int | None)` → `{href: "/champions", seasons: [{year, driver: {name, ref, constructor}, constructor: {name, ref} | None, href}]}` — never pairs the driver's team with the constructors' champion (the two are separate fields, as the endpoint serves them)
  - `get_best_seasons(limit: int)` → `{href: "/best-seasons", seasons: [{rank, year, score, champion, margin, href}]}` (limit clamped to 1..10)
  - `compare_drivers(a: str, b: str)` / `compare_constructors(a: str, b: str)` → `{a: {name, ref, href}, b: {...}, href: "/compare/drivers?d1=..&d2=..", careers: {...}, headToHead: {...}}` from the compare endpoints
  - `compare_in_season(year: int, kind: Literal["drivers", "constructors"], a: str, b: str)` → `{year, kind, href: "/seasons/{year}/compare?type=..&a=..&b=..", a, b, season: {points (official), wins, podiums, poles, headToHead}, note}` with the note that totals are the official championship totals and the delta is A minus B
- Labels: `"{year} round {round} {section}"`, `"driver {ref}"`, `"constructor {ref}"`, `"circuit {ref}"`, `"records: {category}"`, `"champions"`, `"best seasons"`, `"compare {a} vs {b}"`, `"{year} compare"`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_chat_tools_data.py
import json
import pytest
from src.chat.constants import MAX_TOOL_RESULT_CHARS
from src.chat.tools.registry import run_tool, tool_specs
import src.chat.tools  # noqa: F401

EXPECTED_TOOLS = {"search", "site_map", "get_season", "get_standings", "get_progression", "get_title_permutations",
                  "get_calendar", "get_race", "get_driver", "get_constructor", "get_circuit", "get_records",
                  "get_champions", "get_best_seasons", "compare_drivers", "compare_constructors", "compare_in_season", "navigate"}

def test_the_full_tool_set_is_registered():
    assert {s["name"] for s in tool_specs()} == EXPECTED_TOOLS

@pytest.mark.parametrize("section", ["results", "qualifying", "sprint", "pitstops"])
def test_get_race_sections_share_the_race_href_and_stay_compact(db, race_seed_data, section):
    out = json.loads(run_tool(db, "get_race", {"year": 2023, "round": 1, "section": section}))
    assert out.get("href") == "/seasons/2023/races/1" or "error" in out  # sprint/pitstops may be absent in the seed
    assert len(json.dumps(out)) < MAX_TOOL_RESULT_CHARS

def test_get_race_results_are_the_top_ten_with_grid_points_and_status(db, race_seed_data):
    out = json.loads(run_tool(db, "get_race", {"year": 2023, "round": 1, "section": "results"}))
    assert len(out["rows"]) <= 10 and {"position", "name", "ref", "constructor", "grid", "points", "status"} <= set(out["rows"][0])

def test_entity_tools_carry_career_totals_and_hrefs(db, seed_data):
    d = json.loads(run_tool(db, "get_driver", {"ref": "max_verstappen"}))
    assert d["href"] == "/drivers/max_verstappen" and {"starts", "wins", "podiums", "poles", "championships", "points"} <= set(d["career"])
    c = json.loads(run_tool(db, "get_constructor", {"ref": "red_bull"}))
    assert c["href"] == "/constructors/red_bull" and "lineage" in c
    assert "error" in json.loads(run_tool(db, "get_driver", {"ref": "nobody"}))

def test_get_records_passes_every_filter_explicitly(db, race_seed_data):
    out = json.loads(run_tool(db, "get_records", {"entity": "driver", "category": "wins", "year_from": None, "year_to": None, "nationality": None, "min_starts": None, "limit": 3}))
    assert out["href"] == "/records" and len(out["rows"]) <= 3 and out["rows"][0]["href"].startswith("/drivers/")

def test_champions_keep_driver_and_constructor_champions_apart(db, seed_data):
    out = json.loads(run_tool(db, "get_champions", {"year_from": None, "year_to": None}))
    assert out["href"] == "/champions"
    for s in out["seasons"]:
        assert set(s) >= {"year", "driver", "constructor", "href"}

def test_compare_tools_build_the_page_href(db, race_seed_data):
    out = json.loads(run_tool(db, "compare_drivers", {"a": "max_verstappen", "b": "max_verstappen"}))
    assert "error" in out  # same ref twice is refused by the endpoint
```

Use refs from `race_seed_data` for the positive comparison case after reading `conftest.py`; keep an assertion that `href` starts with `/compare/drivers?`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_chat_tools_data.py -v`
Expected: FAIL on `test_the_full_tool_set_is_registered`

- [ ] **Step 3: Implement the four modules and import them from `tools/__init__.py`**

Every router call passes every argument explicitly (a FastAPI `Query` default is an object, not a value, when the function is called directly).

- [ ] **Step 4: Run the tests to verify they pass, then the whole suite**

Run: `cd pipeline && uv run pytest tests/test_chat_tools_data.py -v && uv run pytest -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/chat/tools pipeline/tests/test_chat_tools_data.py
git commit -m "feat(chat): race, entity, records, champions and comparison tools"
```

---

### Task 8: Prompt, the loop, SSE and the endpoint

**Files:**
- Create: `pipeline/src/chat/prompt.py`, `pipeline/src/chat/sse.py`, `pipeline/src/chat/loop.py`, `pipeline/src/api/routers/chat.py`
- Modify: `pipeline/src/api/main.py` (include router)
- Test: `pipeline/tests/test_chat_prompt.py`, `pipeline/tests/test_chat_endpoint.py`

**Interfaces:**
- Produces in `src/chat/prompt.py`: `SYSTEM: str` (stable; persona, data rules from the spec's "System prompt" section, answer shape, scope, "use `search` first when unsure of a ref", "use `navigate` only for an imperative"); `page_description(path: str) -> str` (route-pattern map: `/seasons/2024` → "the 2024 season page", `/seasons/2024/races/5` → "the 2024 round 5 race page", `/` → "the home page", unknown → "a page of F1 Tracker"); `user_turn(question: str, *, path: str, page_title: str | None, today: date) -> str` → `f"[Today: {today.isoformat()}. The reader is on {page_description(path)}{' titled “' + page_title + '”' if page_title else ''} ({path}).]\n\n{question}"`.
- Produces in `src/chat/sse.py`: `sse(event: str, data: dict) -> str` → `"event: {event}\ndata: {json}\n\n"`.
- Produces in `src/chat/loop.py`:
  - `class ChatMessage(BaseModel): role: Literal["user", "assistant"]; content: constr(strip_whitespace=True, min_length=1, max_length=2000)`
  - `class ChatRequest(BaseModel): messages: list[ChatMessage] = Field(min_length=1, max_length=2 * MAX_CONVERSATION_TURNS); path: str = "/"; pageTitle: str | None = Field(default=None, max_length=200)` with a validator that the last message is `user`
  - `def build_messages(body: ChatRequest, today: date) -> list[Message]` — keeps the last `HISTORY_TURNS` user/assistant pairs, drops oldest pairs while `sum(len(content)) // 4 > INPUT_SOFT_CAP_TOKENS`, and wraps the final user message with `user_turn(...)`
  - `def run_chat(db: Session, body: ChatRequest, *, ip_hash: str, now: datetime) -> Iterator[str]` — yields SSE strings: `text {"delta"}`, `tool {"name", "label"}`, `navigate {"href"}` (only for a successful `navigate` result), `usage {"toolCalls", "costUsd"}`, `error {"code": "provider", "message"}`, `done {"id": <ledger row id>, "outcome"}`. Loop: `stream_turn` → forward text → on `Done` with tool calls, run each via `run_tool`, append the assistant content and one `user` message of `tool_result` blocks (`is_error` when the result is an `{"error"}`), continue; after `MAX_TOOL_CALLS` the next call uses `tool_choice={"type": "none"}` and a trailing `user` text block "Answer with what you have."; stops on `stop_reason != "tool_use"`. The ledger row is written in a `finally` (so a client disconnect still records), outcome `ok` or `error`.
- Produces in `src/api/routers/chat.py`: `POST /api/chat` → 503 `{"detail": {"code": "disabled"}}` when `not settings.chat_enabled`; computes `ip_hash(client_ip(request), now.date(), settings.chat_ip_salt)`; `check_gates` → on refusal writes a ledger row with that outcome and returns `JSONResponse(status, {"detail": {"code", "message"}})`; else `StreamingResponse(run_chat(...), media_type="text/event-stream", headers={"Cache-Control": "no-store"})`. `POST /api/chat/feedback` body `{"id": str, "thumbs": Literal[1, -1]}` → 204, or 404 when no row.
- Consumes: everything from Tasks 2–7.

- [ ] **Step 1: Write the failing prompt tests**

```python
# tests/test_chat_prompt.py
import datetime
from src.chat.prompt import SYSTEM, page_description, user_turn

def test_system_prompt_is_stable_and_states_the_data_rules():
    for phrase in ("official", "what-if", "Fast-F1", "1958", "lineage", "navigate", "search"):
        assert phrase in SYSTEM
    assert "2026" not in SYSTEM and "Today" not in SYSTEM

def test_user_turn_carries_date_path_and_title():
    turn = user_turn("Who leads?", path="/seasons/2024", page_title="2024 Season", today=datetime.date(2026, 10, 26))
    assert turn.startswith("[Today: 2026-10-26. The reader is on the 2024 season page")
    assert "(/seasons/2024)" in turn and turn.endswith("Who leads?")

def test_page_description_knows_the_main_routes():
    assert page_description("/seasons/2024/races/5") == "the 2024 round 5 race page"
    assert page_description("/drivers/lewis-hamilton") == "the driver page for lewis-hamilton"
    assert page_description("/whatever") == "a page of F1 Tracker"
```

- [ ] **Step 2: Write the failing endpoint tests with a scripted fake model**

```python
# tests/test_chat_endpoint.py
import json
from types import SimpleNamespace
import pytest
from src.chat import loop as chat_loop
from src.chat.events import Done, TextDelta, ToolCall, UsageEvent
from src.chat.ledger import Usage
from src.db.models import ChatUsage
from src.config import settings

def parse_sse(body: str) -> list[tuple[str, dict]]:
    out = []
    for chunk in body.strip().split("\n\n"):
        lines = dict(l.split(": ", 1) for l in chunk.splitlines())
        out.append((lines["event"], json.loads(lines["data"])))
    return out

@pytest.fixture
def chat_on(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "k")
    monkeypatch.setattr(settings, "chat_model", "claude-haiku-5-5")
    monkeypatch.setattr(settings, "chat_ip_salt", "s")

def script(turns):
    """Each turn is a list of events; stream_turn pops the next one and records the messages it was given."""
    seen = []
    def fake(*, system, tools, messages, max_tokens, tool_choice=None):
        seen.append({"messages": messages, "tool_choice": tool_choice})
        yield from turns.pop(0)
    return fake, seen

def usage(): return UsageEvent(Usage(input_tokens=1000, output_tokens=50))

def test_disabled_chat_is_503(client):
    assert client.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}]}).status_code == 503

def test_happy_path_streams_text_tool_usage_and_done_and_writes_one_row(client, db, chat_on, seed_data, monkeypatch):
    fake, seen = script([
        [TextDelta("Checking."), ToolCall("t1", "get_standings", {"year": 2023, "kind": "drivers", "focus_ref": None}), usage(),
         Done("tool_use", [{"type": "text", "text": "Checking."}, {"type": "tool_use", "id": "t1", "name": "get_standings", "input": {"year": 2023, "kind": "drivers", "focus_ref": None}}])],
        [TextDelta("Max leads. [2023](/seasons/2023)"), usage(), Done("end_turn", [{"type": "text", "text": "Max leads. [2023](/seasons/2023)"}])],
    ])
    monkeypatch.setattr(chat_loop, "stream_turn", fake)
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "Who leads?"}], "path": "/seasons/2023", "pageTitle": "2023"}, headers={"Cf-Connecting-Ip": "198.51.100.7"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream") and r.headers["cache-control"] == "no-store"
    events = parse_sse(r.text)
    assert events[0] == ("text", {"delta": "Checking."})
    assert events[1] == ("tool", {"name": "get_standings", "label": "2023 standings"})
    assert ("text", {"delta": "Max leads. [2023](/seasons/2023)"}) in events
    assert events[-2][0] == "usage" and events[-2][1]["toolCalls"] == 1
    assert events[-1][0] == "done" and events[-1][1]["outcome"] == "ok"
    rows = db.query(ChatUsage).all()
    assert len(rows) == 1 and rows[0].tool_calls == 1 and rows[0].input_tokens == 2000 and rows[0].cost_usd > 0
    assert rows[0].id == events[-1][1]["id"]
    # the tool result went back to the model as a tool_result block, and the user turn carried the page context
    second = seen[1]["messages"]
    assert second[-1]["role"] == "user" and second[-1]["content"][0]["type"] == "tool_result"
    assert "[Today:" in seen[0]["messages"][-1]["content"] and "/seasons/2023" in seen[0]["messages"][-1]["content"]

def test_tool_call_cap_forces_a_final_answer_without_tools(client, db, chat_on, seed_data, monkeypatch):
    call = lambda i: ToolCall(f"t{i}", "site_map", {})
    block = lambda i: {"type": "tool_use", "id": f"t{i}", "name": "site_map", "input": {}}
    turns = [[call(i), usage(), Done("tool_use", [block(i)])] for i in range(6)]
    turns.append([TextDelta("Here is what I have."), usage(), Done("end_turn", [{"type": "text", "text": "Here is what I have."}])])
    fake, seen = script(turns)
    monkeypatch.setattr(chat_loop, "stream_turn", fake)
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "loop"}]})
    assert seen[-1]["tool_choice"] == {"type": "none"}
    assert "Answer with what you have." in json.dumps(seen[-1]["messages"][-1])
    assert parse_sse(r.text)[-1][1]["outcome"] == "ok" and db.query(ChatUsage).one().tool_calls == 6

def test_unknown_tool_and_bad_args_are_error_results_and_the_loop_continues(client, db, chat_on, monkeypatch):
    fake, seen = script([
        [ToolCall("t1", "nope", {}), ToolCall("t2", "search", {"q": 3}), usage(), Done("tool_use", [{"type": "tool_use", "id": "t1", "name": "nope", "input": {}}, {"type": "tool_use", "id": "t2", "name": "search", "input": {"q": 3}}])],
        [TextDelta("Sorry."), usage(), Done("end_turn", [{"type": "text", "text": "Sorry."}])],
    ])
    monkeypatch.setattr(chat_loop, "stream_turn", fake)
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "x"}]})
    results = seen[1]["messages"][-1]["content"]
    assert all(block["is_error"] for block in results) and parse_sse(r.text)[-1][1]["outcome"] == "ok"

def test_navigate_emits_an_event_only_for_site_paths(client, db, chat_on, monkeypatch):
    fake, _ = script([
        [ToolCall("t1", "navigate", {"href": "https://evil.example"}), ToolCall("t2", "navigate", {"href": "/seasons/2021/races/22"}), usage(),
         Done("tool_use", [{"type": "tool_use", "id": "t1", "name": "navigate", "input": {"href": "https://evil.example"}}, {"type": "tool_use", "id": "t2", "name": "navigate", "input": {"href": "/seasons/2021/races/22"}}])],
        [TextDelta("Opening."), usage(), Done("end_turn", [{"type": "text", "text": "Opening."}])],
    ])
    monkeypatch.setattr(chat_loop, "stream_turn", fake)
    events = parse_sse(client.post("/api/chat", json={"messages": [{"role": "user", "content": "open abu dhabi 2021"}]}).text)
    assert [d for e, d in events if e == "navigate"] == [{"href": "/seasons/2021/races/22"}]

def test_provider_error_ends_with_an_error_event_and_an_error_row(client, db, chat_on, monkeypatch):
    def boom(**kwargs):
        yield TextDelta("Max")
        raise RuntimeError("upstream 529")
    monkeypatch.setattr(chat_loop, "stream_turn", boom)
    events = parse_sse(client.post("/api/chat", json={"messages": [{"role": "user", "content": "x"}]}).text)
    assert events[-2] == ("error", {"code": "provider", "message": "The Engineer lost the radio. Try again."})
    assert events[-1][1]["outcome"] == "error" and db.query(ChatUsage).one().outcome == "error"

def test_client_disconnect_still_writes_the_row(db, chat_on, monkeypatch):
    fake, _ = script([[TextDelta("a"), TextDelta("b"), usage(), Done("end_turn", [{"type": "text", "text": "ab"}])]])
    monkeypatch.setattr(chat_loop, "stream_turn", fake)
    gen = chat_loop.run_chat(db, chat_loop.ChatRequest(messages=[{"role": "user", "content": "x"}]), ip_hash="h", now=chat_loop.utcnow())
    next(gen); gen.close()
    assert db.query(ChatUsage).count() == 1

@pytest.mark.parametrize("body", [
    {"messages": []},
    {"messages": [{"role": "user", "content": "   "}]},
    {"messages": [{"role": "user", "content": "a"}, {"role": "assistant", "content": "b"}]},
    {"messages": [{"role": "user", "content": "x" * 2001}]},
])
def test_invalid_bodies_are_400_level_and_write_no_row(client, db, chat_on, body):
    assert client.post("/api/chat", json=body).status_code == 422
    assert db.query(ChatUsage).count() == 0

def test_rate_and_budget_refusals_are_json_not_streams(client, db, chat_on, monkeypatch):
    monkeypatch.setattr(settings, "chat_ip_per_10min", 0)
    r = client.post("/api/chat", json={"messages": [{"role": "user", "content": "x"}]})
    assert r.status_code == 429 and r.json()["detail"]["code"] == "rate_limited"
    assert db.query(ChatUsage).one().outcome == "rate_limited"

def test_history_window_keeps_the_last_eight_turns():
    msgs = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"m{i}"} for i in range(30)] + [{"role": "user", "content": "last"}]
    built = chat_loop.build_messages(chat_loop.ChatRequest(messages=msgs), today=chat_loop.utcnow().date())
    assert len(built) == 17 and built[0]["role"] == "user" and built[-1]["content"].endswith("last")

def test_feedback_sets_thumbs(client, db, chat_on):
    from src.chat.ledger import Usage, record
    row = record(db, model="claude-haiku-5-5", usage=Usage(), tool_calls=0, outcome="ok", ip_hash="h", now=chat_loop.utcnow())
    assert client.post("/api/chat/feedback", json={"id": row.id, "thumbs": -1}).status_code == 204
    assert client.post("/api/chat/feedback", json={"id": "nope", "thumbs": 1}).status_code == 404
```

`chat_loop.utcnow()` is `datetime.now(UTC)`, exposed so tests and the router share one clock.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_chat_prompt.py tests/test_chat_endpoint.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.chat.prompt'`

- [ ] **Step 4: Implement `prompt.py`, `sse.py`, `loop.py`, `routers/chat.py`; include the router in `main.py` (`app.include_router(chat.router, prefix="/api", tags=["chat"])`)**

System prompt copy: port the eval's `SYSTEM` from `pipeline/evals/engineer/run.py` and add the spec's data rules (official standings only; cross-era scoring is a what-if; say when Fast-F1 data is missing (2018+ only); constructor tables before 1958 are not official; a lineage is a chain of entries), the answer shape (two to four sentences, 1–3 markdown links with site-relative paths, `navigate` only for an imperative), and the scope line (Formula 1 and this site; decline the rest in one sentence). The loop runs `stream_turn` inside the generator that `StreamingResponse` executes in Starlette's threadpool; no `async` in `src/chat/`.

- [ ] **Step 5: Run the tests to verify they pass, then the suite and lint**

Run: `cd pipeline && uv run pytest tests/test_chat_prompt.py tests/test_chat_endpoint.py -v && uv run pytest -q && uv run ruff check . && uv run ruff format --check .`
Expected: PASS, clean

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/chat pipeline/src/api/routers/chat.py pipeline/src/api/main.py pipeline/tests/test_chat_prompt.py pipeline/tests/test_chat_endpoint.py
git commit -m "feat(chat): POST /api/chat tool loop over SSE with ledger, gates and feedback"
```

---

### Task 9: Ops status `chat` section

**Files:**
- Modify: `pipeline/src/api/routers/ops.py` (new `_chat(db, now)` helper and `"chat"` key in `ops_status`)
- Test: `pipeline/tests/test_ops.py` (append)

**Interfaces:**
- Produces: `ops_status()["chat"]` = `{"enabled": bool, "requestsToday": int, "costTodayUsd": float (rounded to 4), "budgetUsd": float, "toolShare": float | None (share of `ok` rows today with `tool_calls >= 1`; `None` when no `ok` rows), "errorsToday": int (rows with outcome `error`)}`. Counts and dollars only.

- [ ] **Step 1: Write the failing tests**

```python
def test_chat_section_is_present_and_empty_when_nothing_was_asked(client):
    chat = client.get("/api/ops/status").json()["chat"]
    assert chat == {"enabled": False, "requestsToday": 0, "costTodayUsd": 0.0, "budgetUsd": 0.5, "toolShare": None, "errorsToday": 0}

def test_chat_section_reports_counts_and_dollars_only(client, db):
    from src.chat.ledger import Usage, record
    now = datetime.datetime.now(UTC)
    record(db, model="claude-haiku-5-5", usage=Usage(output_tokens=1_000_000), tool_calls=1, outcome="ok", ip_hash="h", now=now)
    record(db, model="claude-haiku-5-5", usage=Usage(), tool_calls=0, outcome="ok", ip_hash="h", now=now)
    record(db, model="claude-haiku-5-5", usage=Usage(), tool_calls=0, outcome="error", ip_hash="h", now=now)
    chat = client.get("/api/ops/status").json()["chat"]
    assert chat["requestsToday"] == 3 and chat["costTodayUsd"] == 0.5 and chat["toolShare"] == 0.5 and chat["errorsToday"] == 1
    assert set(chat) == {"enabled", "requestsToday", "costTodayUsd", "budgetUsd", "toolShare", "errorsToday"}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_ops.py -k chat -v`
Expected: FAIL with `KeyError: 'chat'`

- [ ] **Step 3: Implement `_chat` in `ops.py` using `ledger.day_start` and one grouped query over `ChatUsage`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd pipeline && uv run pytest tests/test_ops.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/api/routers/ops.py pipeline/tests/test_ops.py
git commit -m "feat(ops): chat usage section on /api/ops/status"
```

---

### Task 10: Frontend pure helpers — types, SSE parser, answer tokenizer, prompts

**Files:**
- Create: `apps/web/lib/engineer-types.ts`, `apps/web/lib/engineer-sse.ts`, `apps/web/lib/engineer-markdown.ts`, `apps/web/lib/engineer-prompts.ts`
- Test: `apps/web/lib/engineer-sse.test.ts`, `apps/web/lib/engineer-markdown.test.ts`, `apps/web/lib/engineer-prompts.test.ts`

**Interfaces:**
- `engineer-types.ts`: `EngineerMessage { id: string; role: 'user' | 'assistant'; content: string; ledgerId?: string; thumbs?: 1 | -1 }`; `EngineerStatus = { kind: 'idle' } | { kind: 'streaming' } | { kind: 'tool'; label: string } | { kind: 'budget' } | { kind: 'cooldown' } | { kind: 'error'; message: string }`; `EngineerEvent = { event: 'text'; data: { delta: string } } | { event: 'tool'; data: { name: string; label: string } } | { event: 'navigate'; data: { href: string } } | { event: 'usage'; data: { toolCalls: number; costUsd: number } } | { event: 'error'; data: { code: string; message: string } } | { event: 'done'; data: { id: string; outcome: string } }`; `STATUS_LABELS: Record<EngineerStatus['kind'], string>` = idle `RADIO CHECK`, streaming `ON IT`, tool `CHECKING`, budget `OFF THE RADIO`, cooldown `ON COOLDOWN`, error `RADIO FAULT`.
- `engineer-sse.ts`: `createSseParser(onEvent: (event: string, data: unknown) => void): { push(chunk: string): void; end(): void }` — buffers partial lines across chunks, dispatches on each blank line, ignores comment lines and events without data.
- `engineer-markdown.ts`: `AnswerToken = { type: 'text'; value: string } | { type: 'bold'; value: string } | { type: 'link'; label: string; href: string } | { type: 'break' }`; `tokenizeAnswer(text: string): AnswerToken[]` handling `[label](href)`, `**bold**` and `\n`; `isSameOriginPath(href: string): boolean` (`/x` yes, `//x` no, `https://x` no, `javascript:` no).
- `engineer-prompts.ts`: `suggestedPrompts(path: string): [string, string, string]` keyed by route pattern (home, `/seasons/[year]`, `/seasons/[year]/races/[round]`, `/drivers/[ref]`, `/constructors/[ref]`, `/circuits/[ref]`, `/records`, `/best-seasons`, `/compare*`, default).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/engineer-sse.test.ts
import { describe, expect, it } from 'vitest'
import { createSseParser } from './engineer-sse'

describe('createSseParser', () => {
  it('reassembles events split across chunks', () => {
    const seen: [string, unknown][] = []
    const p = createSseParser((e, d) => seen.push([e, d]))
    p.push('event: text\ndata: {"del')
    p.push('ta":"Max"}\n\nevent: do')
    p.push('ne\ndata: {"id":"r1","outcome":"ok"}\n\n')
    p.end()
    expect(seen).toEqual([['text', { delta: 'Max' }], ['done', { id: 'r1', outcome: 'ok' }]])
  })
  it('ignores comments and dispatches a trailing event on end()', () => {
    const seen: string[] = []
    const p = createSseParser((e) => seen.push(e))
    p.push(': keepalive\n\nevent: usage\ndata: {"toolCalls":1,"costUsd":0.0003}')
    p.end()
    expect(seen).toEqual(['usage'])
  })
})
```

```ts
// lib/engineer-markdown.test.ts
import { describe, expect, it } from 'vitest'
import { isSameOriginPath, tokenizeAnswer } from './engineer-markdown'

describe('tokenizeAnswer', () => {
  it('splits links, bold and line breaks', () => {
    expect(tokenizeAnswer('Max leads with **25**.\nSee [2024](/seasons/2024).')).toEqual([
      { type: 'text', value: 'Max leads with ' }, { type: 'bold', value: '25' }, { type: 'text', value: '.' },
      { type: 'break' }, { type: 'text', value: 'See ' }, { type: 'link', label: '2024', href: '/seasons/2024' }, { type: 'text', value: '.' },
    ])
  })
  it('leaves a half-typed link as text while streaming', () => {
    expect(tokenizeAnswer('See [2024](/sea')).toEqual([{ type: 'text', value: 'See [2024](/sea' }])
  })
})

describe('isSameOriginPath', () => {
  it.each([['/seasons/2024', true], ['//evil', false], ['https://evil', false], ['javascript:alert(1)', false], ['seasons', false]])('%s → %s', (href, ok) => {
    expect(isSameOriginPath(href)).toBe(ok)
  })
})
```

```ts
// lib/engineer-prompts.test.ts
import { describe, expect, it } from 'vitest'
import { suggestedPrompts } from './engineer-prompts'

describe('suggestedPrompts', () => {
  it('is page-aware', () => {
    expect(suggestedPrompts('/')[0]).toBe('Who is leading right now?')
    expect(suggestedPrompts('/seasons/2024')[0]).toBe('Who can still win the title?')
    expect(suggestedPrompts('/seasons/2024/races/5')[0]).toBe('Who gained the most places?')
    expect(suggestedPrompts('/attributions')).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && pnpm test -- lib/engineer`
Expected: FAIL (modules not found)

- [ ] **Step 3: Implement the four modules**

- [ ] **Step 4: Run the tests to verify they pass, then lint**

Run: `cd apps/web && pnpm test -- lib/engineer && pnpm lint`
Expected: PASS, clean

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/engineer-*.ts
git commit -m "feat(web): Engineer types, SSE parser, answer tokenizer and page-aware prompts"
```

---

### Task 11: `useEngineer()` hook

**Files:**
- Create: `apps/web/lib/use-engineer.ts`
- Test: `apps/web/lib/use-engineer.test.ts` (pure reducer only)

**Interfaces:**
- Produces: `export function useEngineer(options: { onNavigate: (href: string) => void }): { messages: EngineerMessage[]; status: EngineerStatus; send(question: string): Promise<void>; stop(): void; reset(): void; feedback(messageId: string, thumbs: 1 | -1): Promise<void>; turnsLeft: number }`.
- Also exports the pure `reduce(state: EngineerState, action: EngineerAction): EngineerState` the hook drives, with actions `{ type: 'user'; content: string } | { type: 'event'; event: EngineerEvent } | { type: 'http'; status: number } | { type: 'reset' } | { type: 'idle' }`, so the state machine is testable without React.
- Behaviour: `send` appends the user message, posts `{ messages: last 16 plain turns, path: window.location.pathname, pageTitle: document.querySelector('h1')?.textContent ?? null }` to `${API_BASE_URL}/chat` with an `AbortController`, reads `response.body` through `createSseParser`; `text` appends to the open assistant message; `tool` sets status `{ kind: 'tool', label }`; `navigate` calls `onNavigate(href)` only when `isSameOriginPath(href)`; `done` stores `ledgerId`; HTTP 503 → status `budget`, 429 → `cooldown`, other non-2xx → `error`; `stop` aborts; `reset` clears; transcript persisted under `sessionStorage` key `f1-engineer:v1` on every change and restored on mount; `turnsLeft = 20 - userTurns`; `feedback` posts to `${API_BASE_URL}/chat/feedback` and marks the message.

- [ ] **Step 1: Write the failing reducer tests**

```ts
// lib/use-engineer.test.ts
import { describe, expect, it } from 'vitest'
import { initialState, reduce } from './use-engineer'

describe('engineer reducer', () => {
  it('streams text into one assistant message and records the ledger id', () => {
    let s = reduce(initialState, { type: 'user', content: 'Who leads?' })
    s = reduce(s, { type: 'event', event: { event: 'tool', data: { name: 'get_standings', label: '2024 standings' } } })
    expect(s.status).toEqual({ kind: 'tool', label: '2024 standings' })
    s = reduce(s, { type: 'event', event: { event: 'text', data: { delta: 'Max ' } } })
    s = reduce(s, { type: 'event', event: { event: 'text', data: { delta: 'leads.' } } })
    s = reduce(s, { type: 'event', event: { event: 'done', data: { id: 'r1', outcome: 'ok' } } })
    expect(s.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Max leads.', ledgerId: 'r1' })
    expect(s.status).toEqual({ kind: 'idle' })
  })
  it('maps 503 and 429 to budget and cooldown', () => {
    expect(reduce(initialState, { type: 'http', status: 503 }).status).toEqual({ kind: 'budget' })
    expect(reduce(initialState, { type: 'http', status: 429 }).status).toEqual({ kind: 'cooldown' })
  })
  it('counts turns left out of twenty', () => {
    const s = reduce(initialState, { type: 'user', content: 'a' })
    expect(s.turnsLeft).toBe(19)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && pnpm test -- use-engineer`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `lib/use-engineer.ts` (reducer + hook)**

`API_BASE_URL` from `lib/constants.ts`. Read `sessionStorage` only inside `useEffect` (never during render) so there is no hydration mismatch.

- [ ] **Step 4: Run the tests to verify they pass, then lint**

Run: `cd apps/web && pnpm test -- use-engineer && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/use-engineer.ts apps/web/lib/use-engineer.test.ts
git commit -m "feat(web): useEngineer hook with SSE streaming and sessionStorage transcript"
```

---

### Task 12: Sidebar components, header mount, attributions and status page

**Files:**
- Create: `apps/web/components/engineer/engineer-button.tsx`, `apps/web/components/engineer/engineer-sheet.tsx`, `apps/web/components/engineer/engineer-transcript.tsx`, `apps/web/components/engineer/engineer-answer.tsx`
- Modify: `apps/web/components/layout/header.tsx` (mount), `apps/web/app/attributions/page.tsx` (`DATA_SOURCES` row), `ATTRIBUTIONS.md` (row), `apps/web/lib/types.ts` (`OpsStatus.chat`), `apps/web/app/status/page.tsx` (section)
- Test: `apps/web/components/engineer/engineer-answer.test.ts` (pure link rendering decision only)

**Interfaces:**
- `engineer-button.tsx` (`'use client'`): `export function EngineerButton()` — ghost icon button (`Radio` from lucide) with `aria-label="Ask the Engineer"`, owns `open` state, registers `⌘J`/`Ctrl+J` (`keydown` on `window`, toggles, `preventDefault`), and renders `const EngineerSheet = dynamic(() => import('./engineer-sheet').then(m => m.EngineerSheet), { ssr: false })` only after the first open (`opened` flag), passing `open`/`onOpenChange`.
- `engineer-sheet.tsx` (`'use client'`): `export function EngineerSheet({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void })` — `Sheet` + `SheetContent side="right"` full height, `className` for mobile full width; header strip: `SheetTitle` **ENGINEER** in `display`, a `Tag variant="outline"` showing `STATUS_LABELS[status.kind]` plus the tool label when `kind === 'tool'`; body `EngineerTranscript`; empty state: the disclosure line "Your question is sent to Anthropic (Claude) to be answered; nothing you type is stored here." and three `suggestedPrompts(pathname)` buttons; composer: `Input` + submit, disabled while streaming or when `turnsLeft === 0` (then a "New conversation" button calls `reset`); `useEngineer({ onNavigate: router.push })` with `useRouter` from `next/navigation`; the sheet stays mounted across navigation because `EngineerButton` lives in the header.
- `engineer-transcript.tsx`: `export function EngineerTranscript({ messages, status, onFeedback }: ...)` — user turns right-aligned slab, assistant turns rendered by `EngineerAnswer`, thumbs up/down (`ThumbsUp`/`ThumbsDown` icons) on assistant messages with a `ledgerId`, auto-scroll to the end on change.
- `engineer-answer.tsx`: `export function EngineerAnswer({ content }: { content: string })` renders `tokenizeAnswer(content)`: links as `next/link` when `isSameOriginPath(href)` else plain text (`linkTarget(href): 'internal' | 'text'` exported for the test).
- `header.tsx`: `{process.env.NEXT_PUBLIC_CHAT_ENABLED === 'true' && <EngineerButton />}` beside `CommandSearch`. The header still fetches nothing.
- `types.ts`: `OpsChat { enabled: boolean; requestsToday: number; costTodayUsd: number; budgetUsd: number; toolShare: number | null; errorsToday: number }`, `OpsStatus.chat: OpsChat`.
- `status/page.tsx`: a `SectionCard title="Engineer" icon={Radio}` with `Field`s: Requests today, Cost today (as `$x.xxxx of $y.yy`), Answers using tools (percentage or "—"), Errors today; "Off" when `!chat.enabled`.
- `DATA_SOURCES` row: `{ name: 'Anthropic (Claude)', href: 'https://www.anthropic.com', used: 'Answers the Engineer chat sidebar. Each question is sent to the Claude API with the data the tools return; nothing a reader types is stored by this site.', licence: 'Commercial API terms', licenceHref: 'https://www.anthropic.com/legal/commercial-terms' }` and the matching `ATTRIBUTIONS.md` table.

- [ ] **Step 1: Write the failing test**

```ts
// components/engineer/engineer-answer.test.ts
import { describe, expect, it } from 'vitest'
import { linkTarget } from './engineer-answer'

describe('linkTarget', () => {
  it('only site paths become links', () => {
    expect(linkTarget('/seasons/2024')).toBe('internal')
    expect(linkTarget('https://example.com')).toBe('text')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && pnpm test -- engineer-answer`
Expected: FAIL (module not found)

- [ ] **Step 3: Build the four components, mount the button, add the attribution row, the `OpsChat` type and the status section**

Styling: `Panel`-like surface via the `Sheet`'s `bg-surface-1` and `brackets` on the transcript container; status tag copy from `STATUS_LABELS`; no colour literals.

- [ ] **Step 4: Verify in the browser**

Run: `cd apps/web && NEXT_PUBLIC_CHAT_ENABLED=true pnpm dev` with the API running locally with `ANTHROPIC_API_KEY`, `CHAT_MODEL=claude-haiku-5-5`, `CHAT_IP_SALT=dev` exported (keys live in the main checkout's `.env`). Check: the button appears, `⌘J` opens the sheet, a question streams with the tag flipping `ON IT` → `CHECKING …` → `RADIO CHECK`, links navigate without closing the sheet, the transcript survives navigation and a reload within the tab, "take me to the 2021 Abu Dhabi race" navigates, thumbs post a 204, and with `NEXT_PUBLIC_CHAT_ENABLED` unset the header has no button.

- [ ] **Step 5: Run the checks**

Run: `cd apps/web && pnpm test && pnpm lint && NODE_ENV=production pnpm build`
Expected: all green; the build output lists no new server-rendered route

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/engineer apps/web/components/layout/header.tsx apps/web/app/attributions/page.tsx ATTRIBUTIONS.md apps/web/lib/types.ts apps/web/app/status/page.tsx
git commit -m "feat(web): Engineer chat sidebar, header mount, status section and attribution"
```

---

### Task 13: CLAUDE.md and deployment notes

**Files:**
- Modify: `CLAUDE.md` (Backend Endpoints: `POST /api/chat`, `POST /api/chat/feedback`, `chat` on `/api/ops/status`; Frontend Components: `components/engineer/`; Conventions: a paragraph on the Engineer — tools are thin wrappers over router functions, no content in `chat_usage`, client IP from `Cf-Connecting-Ip`, budget and rate gates, chat off until `ANTHROPIC_API_KEY`/`CHAT_MODEL`/`CHAT_IP_SALT` are set; env keys under Commands/VPS)
- Modify: `docs/DEPLOYMENT.md` (a "Race Engineer" subsection under the VPS env: set the three keys, set a monthly spend cap in the Anthropic console, set `NEXT_PUBLIC_CHAT_ENABLED=true` in Vercel and redeploy, the Cloudflare rule from Task 3)

- [ ] **Step 1: Write the documentation**

- [ ] **Step 2: Verify the docs name only things that exist**

Run: `grep -n "api/chat\|chat_usage\|CHAT_IP_SALT\|NEXT_PUBLIC_CHAT_ENABLED" CLAUDE.md docs/DEPLOYMENT.md docker/.env.prod.example .env.example`
Expected: every term appears in each file that should carry it

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/DEPLOYMENT.md
git commit -m "docs: Race Engineer chat endpoints, env keys and deployment notes"
```

---

### Task 14: Regression eval against the built loop

**Files:**
- Modify: `pipeline/evals/engineer/run.py` (replace the eval's own loop, tools and prompt with imports from `src.chat`: `prompt.SYSTEM`, `tools.registry.tool_specs/run_tool`, `model.stream_turn`; keep the judge, the cost table and the report; drop the Groq adapter and models)
- Keep: `pipeline/evals/engineer/questions.json`, `results/`

- [ ] **Step 1: Rewire `run.py` to the shipped modules and delete the duplicated tool and prompt code**

- [ ] **Step 2: Run the eval against the local database**

Run: `cd pipeline && set -a && source ../../../Repositories/f1-tracker/.env && set +a && CHAT_MODEL=claude-haiku-5-5 CHAT_IP_SALT=eval uv run python evals/engineer/run.py --yes`
Expected: 30/30 with the shipped prompt and the full tool set; cost on the order of $0.01. If any question fails, fix the prompt or the tool payload (not the question) and re-run.

- [ ] **Step 3: Commit**

```bash
git add pipeline/evals/engineer
git commit -m "test(chat): point the Engineer eval at the shipped loop"
```
