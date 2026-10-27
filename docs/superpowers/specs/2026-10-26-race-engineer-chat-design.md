# Race Engineer — the chat sidebar

Date: 2026-10-26 · Scope: `pipeline/` (new chat endpoint + tools), `apps/web` (sidebar), `docker/`, `docs/`

## Intent

A reader opens a sidebar anywhere on the site, asks a question in plain
language ("who is leading the championship?", "which driver has the most
podiums without a win?", "where do I see pit stop times for Monaco 2024?") and
gets an answer that is **grounded in the site's own data**, phrased in a
sentence or two, and **linked to the pages that show the detail**. It can also
take the reader there when asked ("open the 2021 Abu Dhabi race").

The owner wants it for both audiences: the casual visitor asking who won in
2008 and the enthusiast asking long-tail questions. The hard constraints are a
small, **bounded** monthly bill and no reader data stored on the server.

The persona is the **Race Engineer** — the voice on the radio that answers the
driver's questions with data and tells them what to do next. Short form in the
UI: **Engineer**. A generic term, never a real person's name, in keeping with
the trademark care elsewhere in the project.

## Goals

1. Answers only ever contain numbers that came back from a tool. The tools are
   the existing query layer, so every correctness rule in `CLAUDE.md` (official
   standings, countback, lineage, what-if scoring) is inherited, not re-derived.
2. Every answer ends with links into the site; an imperative ("take me to…")
   navigates.
3. Knows which page the reader is on: "who is leading here?" on `/seasons/2024`
   works.
4. The monthly bill has a hard ceiling set in config, and the realistic spend is
   well under it. Rate limits protect the ceiling; the ceiling protects the
   wallet.
5. One model, chosen by an eval before the build: Claude Haiku 5.5 through the
   official Anthropic SDK (see "Provider eval" below). The agent loop is ours;
   the model id stays a config value so a successor can be swapped in.
6. Nothing a reader types is stored on the server.

## Non-goals

- No text-to-SQL in this version. A guarded read-only SQL tool is a later phase,
  behind a flag, once the eval shows which long-tail questions the tool set
  cannot answer.
- No charts inside answers (later phase).
- No accounts, no login, no cross-device conversation history.
- No changes to the data correctness rules, caching strategy or SEO plumbing
  described in `CLAUDE.md`.
- No Vercel AI SDK and no agent framework; the loop is small and ours.

## Anti-goals (failure even if it "works")

- An answer that states a standings figure the API never returned (summed race
  points, a guessed champion). The system prompt forbids it and the tools make
  it unnecessary.
- An unbounded bill. Any path that calls a model must go through the budget
  gate.
- The chat adding bytes to cached pages or a fetch to the header. The header
  renders on every page and fetches nothing; that stays true.
- A chatbot that answers anything. It declines off-topic requests politely and
  briefly.
- Storing conversation text, IPs in the clear, or anything a reader would not
  expect a stats site to keep.

## Architecture (decided)

```
browser  ──POST /api/chat (SSE)──▶  FastAPI on the VPS  ──▶  Anthropic API
   │                                   │  tool loop (ours)      (Claude Haiku 5.5)
   │  conversation in sessionStorage   │  tools = src/db/queries.py
   │                                   └─ chat_usage table (ledger + counters)
   └─ navigate(href) runs router.push client-side
```

**The agent loop runs in FastAPI on the VPS, not in a Next route handler.**
The tools are Python functions in `src/db/queries.py` and the routers, so they
run in-process with no HTTP self-calls; Vercel Hobby meters function duration
and a streaming tool-loop turn runs 5–30 s; and the provider API key sits beside
the other secrets in `/srv/apps/f1_api/.env`. Consequence: CORS gains `POST`
for this one route. Caddy needs no change: its default flushing already
streams `text/event-stream` through the site block's encoder (measured, see
Streaming below).

**Conversation state lives in the browser.** `sessionStorage` holds the
transcript (plain text turns) plus the page it was last on; it survives
navigation and dies with the tab. Each request sends the last N turns as plain
`user`/`assistant` text. Prior turns' thinking and tool blocks are never
replayed — only the current turn's tool loop needs them, and the loop holds
those in memory for the duration of one request. (The Anthropic API accepts
text-only prior assistant turns; the builder should not reintroduce a
server-side transcript to "fix" this.)

**The server keeps an anonymised ledger only**: `chat_usage` rows with
timestamp, model, provider, tokens in/out/cached, computed cost, tool-call
count, outcome (`ok` / `rate_limited` / `budget` / `error` / `declined`), and a
daily-rotating HMAC of the client IP (salt = the day + a secret, so rows cannot
be joined across days). No content. This table is simultaneously the global
daily budget counter, the per-IP daily counter and the cost report; it is
written from the request's own session after the response completes, like
`ingest_runs`. The API runs two workers, so counters are never in process
memory.

### Model client

`src/chat/model.py` is one thin client over the official `anthropic` SDK; there
is no provider protocol and no second adapter (the eval below settled the
provider, and an unused adapter would be exactly the "fallback later" path the
owner ruled out). It exposes one function:

```python
def stream_turn(*, system: str, tools: list[ToolSpec],
                messages: list[Message], max_tokens: int) -> Iterator[Event]
```

`Event` is our own small union: `text_delta`, `tool_call(name, id, args)`,
`usage(in, out, cache_write, cache_read)`, `done(stop_reason)`. The call is
`client.messages.stream` with `thinking` omitted (on Claude Haiku 5.5 thinking
is on by default and controlled by `output_config.effort`, set to `low` for this
route — the setting the eval ran with), `cache_control` on the system block and
the last tool definition, `strict: true` on every tool, `tool_choice` left at
`auto` (forced tool use is rejected on the current models). Tool JSON schemas
are written once (Pydantic models) and rendered to the Anthropic shape.

Selection: `CHAT_MODEL=claude-haiku-5-5` and `ANTHROPIC_API_KEY`. Either unset
means the endpoint returns 503 and the sidebar hides its button (the header's
mount decides from a public env flag, `NEXT_PUBLIC_CHAT_ENABLED`).

### The loop

Per request: budget gate → rate gate → build messages → stream a turn → on each
`tool_call`, run the tool (bounded: ≤ 6 calls per turn, each with a 5 s SQL
statement timeout) and append the result → stream again → until `done` or the
cap. Text deltas are forwarded to the client as they arrive. On the cap, the
loop sends one final turn with the instruction "answer with what you have".
Tool errors are returned to the model as error results, never raised to the
client; a provider error ends the stream with an `error` event and a ledger row.

### Tools (first set)

Each tool returns a **compact** JSON payload with `href` fields pointing at the
page that shows the detail. Compact means: trimmed to the fields an answer
needs (names, positions, points, refs, hrefs), ≤ ~1.5k tokens per result, lists
cut to the top 10 plus any entity the question named. The tool descriptions are
part of the prompt and are where the house rules about data live (e.g. the
standings tool says "official championship totals; `dropped` is what best-N
removed").

| Tool | Wraps | Returns |
|---|---|---|
| `search(q)` | `/search` | drivers, constructors, circuits, seasons, races with hrefs |
| `site_map()` | static | every route and what it shows (from `lib/site-pages.ts` + the routes table); for "where can I see…" |
| `get_season(year)` | `/seasons/{year}` | champion, scoring note, round count, href |
| `get_standings(year, kind, focus_ref?)` | standings | top 10 + the focused entity, official points, `dropped` |
| `get_progression(year, kind)` | progression | leader after each round, lead changes |
| `get_title_permutations(year, kind)` | permutations | who can still win, what they need |
| `get_calendar(year)` | calendar | rounds, dates, winners, next race |
| `get_race(year, round, section)` | race detail | `results` / `qualifying` / `sprint` / `pitstops`; top 10 + named drivers |
| `get_driver(ref)` / `get_constructor(ref)` / `get_circuit(ref)` | detail + stats | career stats, season history summary, href |
| `get_records(entity, category, filters…)` | `/records/explore` | top 10 with the same filters the page has |
| `get_champions(from?, to?)` | `/champions` | year, drivers' champion, constructors' champion |
| `get_best_seasons(limit)` | `/best-seasons` | ranked seasons with score |
| `compare_drivers(a, b)` / `compare_constructors(a, b)` | `/compare/*` | the H2H summary |
| `compare_in_season(year, kind, a, b)` | season compare | official totals, wins, H2H, hrefs |
| `navigate(href)` | **client-side** | no server work; the server emits it as an event and the sidebar runs `router.push` for same-origin paths only |

**Tools are thin wrappers, not a service-layer refactor.** `queries.py` holds
the primitives; the logic the tools need (standings with `dropped`,
progression, permutations, records explore, season compare, race detail with
pit-stop benchmarks) lives in the router functions under `src/api/routers/`.
Each tool calls the router function in-process with an explicit session and
every argument passed, then trims the dict to the compact shape. Lifting that
logic into a shared service layer would touch every correctness-critical
endpoint for no reader-visible gain; it is out of scope. If a wrapper needs a
router function signature changed to be callable without `Depends`, that
change is allowed as long as the endpoint's tests stay green. The DB layer is
synchronous SQLAlchemy through PgBouncer: the per-tool statement timeout is a
`SET LOCAL statement_timeout` inside the tool's transaction, and the streaming
generator runs in Starlette's threadpool. Tests run on SQLite, so the ledger's
date arithmetic must stay portable.

Tool argument validation is strict (Pydantic); an invalid call is returned to
the model as an error result. Refs are f1db refs (`red-bull`); the model is told
to use `search` first when it is unsure of a ref.

### System prompt (shape, not final copy)

A stable, cacheable block: who the Engineer is; the data rules in plain words
(official standings only; cross-era scoring is a what-if; say when Fast-F1 data
is missing; constructor tables before 1958 are not official; a lineage is a
chain of entries, not a team); the answer shape (two to four sentences, numbers
only from tools, end with 1–3 links as markdown, use `navigate` only for an
imperative); scope (Formula 1 and this site; decline the rest in one line); and
the current date **in the user turn, not the system block** (it would break the
cache prefix). The current page path and a one-line description of it travel
in the user turn too.

### Limits and the ceiling (starting numbers, all in env)

| Layer | Setting | Start value | On breach |
|---|---|---|---|
| Anthropic console | monthly spend cap | owner sets | API refuses |
| Global daily budget | `CHAT_DAILY_BUDGET_USD` | 0.50 | 503 + friendly "off the radio until tomorrow" |
| Per-IP | `CHAT_IP_PER_10MIN`, `CHAT_IP_PER_DAY` | 10, 60 | 429 + "take a breath" |
| Per-conversation | turns, tool calls per turn, history window | 20, 6, last 8 turns | sidebar offers "new conversation" |
| Per answer | `max_tokens` output | 600 | trimmed |
| Per request | input tokens (history + tool results) | ~12k soft cap | oldest turns dropped |
| Per tool | SQL statement timeout | 5 s | error result to the model |

Cost per request is computed from the provider's reported usage and a price
table in config (`CHAT_PRICES_JSON`, per-model input/output/cached rates), so
the budget gate sums dollars, not tokens, and a model switch does not silently
change what the ceiling means. The 10-minute and daily per-IP windows are
`SELECT count(*)` over the ledger by the day's IP hash; the 10-minute window
uses the same day-salted hash.

**Client IP (decided by probe, 2026-10-26).** The chain is Cloudflare →
Caddy → uvicorn. Measured on the production box:

- The origin is sealed. A direct TLS connection to the server's public IP
  with the API hostname as SNI, and plain HTTP to port 80, both time out; only
  Cloudflare's ranges reach Caddy (Hetzner firewall), and Caddy's global
  `trusted_proxies` is that same list with `client_ip_headers Cf-Connecting-Ip`.
- A request sent through Cloudflare with a forged `X-Forwarded-For:
  203.0.113.9` was logged by **uvicorn as coming from 203.0.113.9**. Cloudflare
  appends the real address to an existing `X-Forwarded-For` rather than
  replacing it, and uvicorn's `--forwarded-allow-ips '*'` takes the leftmost
  entry. So `request.client.host` is forgeable today and must not be used for
  anything that keys on identity. Caddy's own access log had the right address
  (from `Cf-Connecting-Ip`).

Decision: the per-IP limits and the IP hash read the `Cf-Connecting-Ip`
request header, which is trustworthy because nothing but Cloudflare can reach
Caddy. In local dev (no header) the helper uses `request.client.host`. One
helper, one test that pins the header and ignores `X-Forwarded-For`. No
Caddyfile change is needed.

**Cloudflare as the outer layer.** The free plan includes a rate-limiting rule
and bot protection; the deployment doc gets a short section telling the owner
to add one rule on the chat path (same order of magnitude as the per-IP
limits, e.g. 20 requests per 10 minutes per IP) so floods are dropped at the
edge before they reach the box or the ledger.

**Streaming (decided by probe, 2026-10-26).** A throwaway SSE server was
placed behind a temporary Caddy route on the API hostname with the same
handler chain as the real site block (`encode zstd gzip`, the header set,
`reverse_proxy` with default flushing) and measured from a laptop through
Cloudflare, then removed. Every event arrived 20–100 ms after it was written
at the origin, in three runs: five events one second apart with identity
encoding; the same with a browser-like `Accept-Encoding: gzip, deflate, br,
zstd`; and a three-second wait before headers followed by three events eight
seconds apart. Neither Cloudflare nor Caddy's encoder buffers
`text/event-stream`. Decision: the endpoint is SSE (`Content-Type:
text/event-stream`, `Cache-Control: no-store`), the first event is written as
soon as the gates pass, and there is **no alternative transport in the code**.

Turnstile (or equivalent) is explicitly deferred: add it only if the ledger
shows bot traffic.

### Sidebar (`apps/web`)

- **Mount**: a `'use client'` wrapper in the header next to ⌘K, rendered only
  when `NEXT_PUBLIC_CHAT_ENABLED` is set; it `dynamic()`-imports the sheet body
  with `ssr: false` on first open, exactly like the calendar map wrapper, so the
  cached pages carry nothing but the button. Shortcut: `⌘J` / `Ctrl+J`
  (`lib/keyboard.ts` already owns shortcut handling).
- **Surface**: the existing `Sheet` primitive, `side="right"`, telemetry
  styling (bracketed panel, `label` font for the status line, body in Titillium).
  Full-height sheet on mobile. The header strip reads **ENGINEER** with a radio
  icon and a live status tag: `RADIO CHECK` (idle), `ON IT` (streaming),
  `CHECKING 2024 STANDINGS` (a tool is running; the label comes from the tool
  event), `OFF THE RADIO` (budget), `ON COOLDOWN` (rate limit).
- **Transcript**: streamed markdown with links rendered as `next/link` so a
  click navigates without closing the sheet; the sheet stays open across
  navigation because its state lives in the wrapper and `sessionStorage`.
  Empty state: three suggested prompts that depend on the current page
  (season page → "Who can still win the title?", race page → "Who gained the
  most places?", home → "Who is leading right now?"). Suggested prompts are a
  static map keyed by route pattern in `lib/engineer-prompts.ts`.
- **Context**: each request carries `path` and the page's `h1` text (read from
  the DOM at send time) so the server can describe the page in the user turn.
- **Client hook**: `useEngineer()` in `lib/use-engineer.ts` — `fetch` with a
  `ReadableStream` reader over our SSE event format (`text`, `tool`, `navigate`,
  `usage`, `error`, `done`), transcript state, `sessionStorage` persistence,
  abort on close, "new conversation". No AI SDK dependency.
- **Clock/locale**: nothing in the sidebar is server-rendered, so `useNow()`
  rules do not bite; but no timestamps are shown in the transcript anyway.
- **Feedback**: a thumbs up/down on each answer that posts to the ledger row
  (`outcome` gains `thumbs`); it is the only thing the reader sends that is
  stored, and it is one bit.
- **Disclosure**: the empty state carries one line, "Your question is sent to
  Anthropic (Claude) to be answered; nothing you type is stored here".
  `/attributions` gains a row for Anthropic in `DATA_SOURCES` (it is a service
  the site depends on, and that page is where the site lists what it uses), and
  `ATTRIBUTIONS.md` the matching row. No zero-data-retention requirement is
  assumed; the provider's standard API terms apply.

### Observability

`/api/ops/status` gains a `chat` section: requests today, cost today, budget,
share of answers that used ≥ 1 tool, error count. `/status` shows it. Public,
so counts and dollars only — never a prompt, path or error message.

## Rule: decide before building

The owner's rule for this feature: **what gets built is the final version.**
No probes, feature-detection or "fallback later" paths in the code. Every
uncertainty is resolved by a probe or a test *before* the build, and the
decision is written here. Done so far (details in the sections above):

| Question | Probe | Decision |
|---|---|---|
| Is the origin reachable around Cloudflare? | Direct TLS/HTTP to the public IP | No (times out). `Cf-Connecting-Ip` is trustworthy |
| What client IP does the API see? | Forged `X-Forwarded-For` through Cloudflare | The forged one. Read `Cf-Connecting-Ip`, never `request.client.host` in prod |
| Does SSE stream through Cloudflare + Caddy's encoder? | Throwaway SSE route, three timed runs | Yes, 20–100 ms per event. SSE, no fallback |
| Does Caddy need a flush directive? | Same probe, default `reverse_proxy` | No |
| Which provider and model? | 30-question eval, four models, real tools over the local DB | **Claude Haiku 5.5** via the Anthropic SDK. One client, no Groq adapter |

### Provider eval (run 2026-10-26)

`pipeline/evals/engineer/` (kept: `questions.json`, `tools.py`, `run.py`,
`results/`; not part of the API or the image) ran the agent loop with six tools
(`search`, `site_map`, `get_standings`, `get_race`, `get_driver`,
`get_records`) over 30 questions — 10 casual, 20 enthusiast, each with expected
facts and the page the answer should link to — against the local database
(production dump of 2026-10-20). Same system prompt, same tools, same loop for
every model; Anthropic at `effort: low`, Groq at `reasoning_effort: low`,
`max_tokens` 1200. Judge: every expected fact present (regex) and the expected
href in the answer. Total spend: $0.19 including a two-question smoke run.

| Model | Pass | $/question | Median latency | p90 | Notes |
|---|---|---|---|---|---|
| Claude Haiku 5.5 | **30/30** | **$0.00026** | 3.5 s | 3.9 s | 106k of 136k input tokens served from cache |
| Claude Sonnet 5.5 (reference) | 30/30 | $0.00477 | 3.2 s | 4.0 s | same answers, 18× the price |
| Groq GPT-OSS 120B | 29/30 | $0.00043 | 10.8 s | 24.9 s | one 429; latency is SDK retries against the free tier's **8,000 tokens/minute** cap — one conversation's context is ~4k, so two requests a minute |
| Groq GPT-OSS 20B | 24/30 | $0.00020 | 14.1 s | 25.4 s | wrong facts on 5 enthusiast questions, one malformed tool call, same 429s |

Decision: **Claude Haiku 5.5**. It is the cheapest model that got every answer
right, it is the fastest in practice, prompt caching cuts its input bill by
~80 %, and it has no tokens-per-minute cliff. At $0.00026 a question the daily
budget of $0.50 is ~1,900 answers a day, and a busy month is a few dollars.
Groq is out: GPT-OSS 120B matched Haiku on quality but costs more per question,
and its free tier would fail closed under any real traffic (the paid tier would
be another account and another bill for no quality gain). Sonnet is the same
quality at 18× the price. Every question the six tools could answer was
answered, so no tool is added before the build; the full tool set from the
table above stays as designed.

Questions the eval's judge got wrong, fixed before scoring (no re-run): the
records explorer counts 105 Hamilton poles where a raw qualifying count gives
104 (the page's number is the right one), thousands separators in numbers, and
"most wins" answers that linked the driver's profile rather than `/records`
(both accepted).

## Phases

0. **Provider eval — done** (see "Provider eval" above): Claude Haiku 5.5,
   `CHAT_MODEL=claude-haiku-5-5`. The eval set and runner stay in
   `pipeline/evals/engineer/` as the regression set for phase 2; the build adds
   the `anthropic` dependency to `pipeline/pyproject.toml` and nothing for
   Groq.
1. **MVP**: the full tool set, the loop with every limit and the ledger
   (Alembic migration for `chat_usage`), the sidebar with streaming, links and
   status tags, `/status` section, CORS/Caddy changes, `.env.prod.example` keys,
   `docs/DEPLOYMENT.md` section, `CLAUDE.md` updates (routes table, endpoints,
   env). Tests: the model client against recorded streams, the budget and rate
   gates, every tool's payload shape and size, the SSE parser in Vitest.
2. **Polish**: page-aware prompts, `navigate`, feedback thumbs, the eval set
   grown from real ledger outcomes (never from content — the owner adds
   questions by hand).
3. **Later, separately brainstormed**: guarded SQL tool, charts in answers.

## Builder's calls (made by Claude, overridable)

- FastAPI hosts the loop (reasons above).
- Browser-side transcript; server ledger without content.
- One thin client over the official Anthropic SDK; no provider protocol, no
  second adapter, no OpenAI-compatible shim.
- Starting limit numbers in the table above.
- Name: Race Engineer / Engineer; shortcut ⌘J; tag copy as listed.
- `thinking` omitted and `effort: low` on the Anthropic side for this route.
- Daily-salted IP hashing rather than storing IPs.
- SSE rather than WebSocket (one-directional, works through Caddy and
  `fetch`).
- Thin tool wrappers over the router functions; no service-layer refactor.
- The provider eval ran before the build and its result is final: Claude
  Haiku 5.5. Nothing provisional ships.
- A one-line provider disclosure in the sidebar and a row on `/attributions`.
- Client IP from `Cf-Connecting-Ip` (probed), with a Cloudflare rate-limiting
  rule as the outermost per-IP guard.
- SSE with no alternative transport (probed).

## Left to the builder

- Exact SSE event schema and the hook's internals.
- Exact tool payload shapes, within the compactness rule.
- Final system-prompt copy and tool descriptions (tuned against the eval).
- Migration naming, module layout under `src/chat/`.
- The eval script's format and how pass/fail is judged (exact-match on the
  expected href plus a rubric on the numbers is the suggested start).
