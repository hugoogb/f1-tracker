"""Keeping a multi-hour Fast-F1 backfill readable.

`pnpm fastf1 --refresh-positions --all` is a few hundred sessions. Anything
logging a stack trace per session drowns the progress lines it is printed
between, and the ones that were doing it had all recovered on their own.
"""

import logging

import pytest

from src.ingestion.fastf1_sessions import configure_logging

# Verbatim from requests_cache's stale-if-error path, which logs it with
# exc_info=True after serving a cached response for a failed request.
RECOVERED_MESSAGE = (
    "Request for URL https://api.jolpi.ca/ergast/f1/2026/13/results.json "
    "failed; using cached response"
)


def make_record(message: str) -> logging.LogRecord:
    """A warning carrying a real exception, as requests_cache emits them."""
    try:
        raise ConnectionError("No route to host")
    except ConnectionError:
        return logging.LogRecord(
            name="requests_cache.session",
            level=logging.WARNING,
            pathname=__file__,
            lineno=1,
            msg=message,
            args=(),
            exc_info=logging.sys.exc_info(),
        )


@pytest.fixture()
def root_handler():
    """A handler on the root logger, as `logging.basicConfig` would install."""
    root = logging.getLogger()
    handler = logging.NullHandler()
    root.addHandler(handler)
    try:
        yield handler
    finally:
        root.removeHandler(handler)


def test_cache_fallback_warnings_lose_their_stack_trace(root_handler):
    configure_logging()
    record = make_record(RECOVERED_MESSAGE)

    assert all(f.filter(record) for f in root_handler.filters)

    # The message survives — it names the unreachable source, which is the
    # useful half — but the forty lines under it do not.
    assert record.exc_info is None
    assert "api.jolpi.ca" in record.getMessage()


def test_other_warnings_keep_theirs(root_handler):
    """Only the self-recovering case is quietened; a real failure still shows."""
    configure_logging()
    record = make_record("Something actually broke")

    assert all(f.filter(record) for f in root_handler.filters)
    assert record.exc_info is not None


def test_fastf1_messages_are_not_printed_twice(root_handler):
    """Fast-F1 installs its own console handler, duplicating every message.

    Removing it leaves propagation to deliver one copy through ours, with the
    timestamps the rest of the run uses.
    """
    fastf1_logger = logging.getLogger("fastf1")
    fastf1_logger.addHandler(logging.NullHandler())

    configure_logging()

    assert fastf1_logger.handlers == []
    assert fastf1_logger.propagate is True
    assert fastf1_logger.level == logging.WARNING


def test_configuring_twice_adds_one_filter(root_handler):
    """The entry points are free to call it without checking first."""
    configure_logging()
    configure_logging()

    assert len(root_handler.filters) == 1
