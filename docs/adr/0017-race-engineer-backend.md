# 0017 — Race Engineer backend

The Race Engineer backend: `pipeline/src/chat/` and the eval in `pipeline/evals/engineer/`.

### Read transaction ends before the stream starts

Where: `pipeline/src/api/routers/chat.py` — chat endpoint; `pipeline/src/chat/loop.py` — turn loop

The gates read on a pooled session; that transaction is ended before streaming so no connection idles in a transaction while the model streams. The gates read on a session; that transaction is ended so no pooled connection idles in one while the model streams.

### Site paths are an allowlist

Where: `pipeline/src/chat/constants.py` — site path pattern; `pipeline/src/chat/tools/site.py` — navigate path check

Paths are matched against an allowlist, not a prefix check, because browsers read `/\x` and `/<tab>/x` as `//x`, an external host; callers also refuse `//` anywhere and `..` segments. A `..` segment is refused because the browser would resolve it to a place the tool never checked.

### Failed turns are billed at an estimate

Where: `pipeline/src/chat/loop.py` — `SYSTEM_AND_TOOLS_ESTIMATE`

The constant is the measured token size of the cached prefix (system prompt plus tool schemas) and stands in for the input of a turn that failed before reporting usage. A turn that died before its usage arrived is counted conservatively rather than as free, so the daily budget never under-counts.

### Spend is written even on disconnect

Where: `pipeline/src/chat/loop.py` — ledger write

The ledger write runs on a client disconnect too (GeneratorExit), so spend is never lost.

### cache_control goes on fresh dicts

Where: `pipeline/src/chat/model.py` — request building

Tool and system specs are copied per call so cache_control never lands on the shared specs.

### Tool order is stable with navigate last

Where: `pipeline/src/chat/tools/registry.py` — `tool_specs`

Specs are sorted so `navigate` is last and the order never varies, which keeps the cached prompt prefix stable.

### Tool results are cut with escaping headroom

Where: `pipeline/src/chat/tools/registry.py` — `run_tool` truncation

The 6,000-char cap leaves room for the extra characters JSON escaping adds when the cut text is re-encoded.

### Eval cost estimate assumptions

Where: `pipeline/evals/engineer/run.py` — `cost_estimate`

The eval's cost estimate assumes each follow-up model call re-sends the prefix plus about 1.2k tokens of tool traffic. It is an upper bound because Anthropic prompt-cache hits lower the real figure.

### The chat tool renames teammateSeasons to sharedTeamSeasons

Where: `pipeline/src/chat/tools/compare.py` — `_drivers_run` (`sharedTeamSeasons`)

The compare router's `teammateSeasons` lists seasons in which both drivers drove for the same constructor, not necessarily in the same races. The model read the router's name as "seasons as teammates", so the tool sends the field as `sharedTeamSeasons` and its description says what it holds. Do not pass the router's name through.
