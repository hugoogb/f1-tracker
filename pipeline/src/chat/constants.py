"""Limits for the Race Engineer chat."""

MAX_TOOL_CALLS = 6
HISTORY_TURNS = 8
MAX_CONVERSATION_TURNS = 20
INPUT_SOFT_CAP_TOKENS = 12_000
STATEMENT_TIMEOUT_MS = 5_000
MAX_TOOL_RESULT_CHARS = 6_000
TOP_N = 10
NAVIGATE = "navigate"

# A site path, for the page a question comes from and for `navigate`. An
# allowlist, not a prefix check: browsers read `/\\x` and `/<tab>/x` as `//x`, an
# external host. Callers also refuse `//` anywhere.
SITE_PATH = r"^/[A-Za-z0-9_\-./]*(\?[A-Za-z0-9_=&\-]*)?$"
