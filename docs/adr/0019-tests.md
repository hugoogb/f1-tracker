# 0019 — Tests

What tests deliberately check, and why their fixtures look the way they do.

### Logging filter test uses the real requests_cache message

Where: `pipeline/tests/test_fastf1_logging.py` — `RECOVERED_MESSAGE`

The recovered-request test uses the message requests_cache logs verbatim on its stale-if-error path, with exc_info=True. The filter is built for that record, so a paraphrase would stop exercising it.

### Official standings fixture differs from re-scored totals

Where: `pipeline/tests/test_normalised_standings.py` — `season` fixture

The official standings in the normalised-standings fixture deliberately differ from any re-scored total. That way the endpoint cannot pass by echoing the official table.
