"""Backfill per-image attribution for Wikimedia Commons assets already on disk.

The image ingestors skip assets that already exist, so images downloaded before
attribution capture was added carry no credit metadata. This script rebuilds
`apps/web/public/credits/wikimedia-credits.json` from the files currently in
`apps/web/public/`, without re-downloading any image.

Commons files are individually licensed (CC BY-SA, CC BY, public domain, ...),
and CC BY-SA requires naming the author and licence wherever the image is used.
The manifest this writes is what the frontend `/attributions` page renders.

Usage (from `pipeline/`):

    uv run python scripts/build_credits.py           # fill in missing credits
    uv run python scripts/build_credits.py --refresh # re-fetch every entry

Requires network access to commons.wikimedia.org and query.wikidata.org.
"""

import argparse
import logging
import sys
import time
import urllib.parse
from pathlib import Path

# Add the pipeline directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.ingestion.images import (  # noqa: E402
    COMMONS_LOGOS,
    HEADSHOT_SIZE,
    HEADSHOTS_DIR,
    LOGOS_DIR,
    WIKIDATA_QUERY,
    WIKIDATA_SPARQL_URL,
    WIKIMEDIA_CREDITS_PATH,
    WikidataHeadshotIngestor,
    _fetch_json,
    _load_credits,
    _save_credits,
    _wikimedia_file_info,
)

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("credits")


def wikidata_image_urls() -> dict[str, str]:
    """Map Wikidata driver label -> Commons image URL."""
    encoded = urllib.parse.urlencode({"query": WIKIDATA_QUERY, "format": "json"})
    data = _fetch_json(f"{WIKIDATA_SPARQL_URL}?{encoded}", timeout=60)
    if not data or "results" not in data:
        log.warning("Wikidata SPARQL query failed — skipping headshot credits")
        return {}

    images: dict[str, str] = {}
    for result in data["results"]["bindings"]:
        name = result.get("driverLabel", {}).get("value", "")
        url = result.get("image", {}).get("value", "")
        if name and url and name not in images:
            images[name] = url
    return images


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="re-fetch credits for entries already in the manifest",
    )
    args = parser.parse_args()

    credits = _load_credits()
    before = len(credits)
    resolved = 0
    missing: list[str] = []

    # --- Historic constructor logos (curated Commons filenames) ---
    for ref, filename in COMMONS_LOGOS.items():
        key = f"logos/{ref}.png"
        if not (LOGOS_DIR / f"{ref}.png").exists():
            continue
        if key in credits and not args.refresh:
            continue

        info = _wikimedia_file_info(filename, width=200)
        if not info:
            missing.append(key)
            log.warning("  %s: not found on Commons (%s)", ref, filename)
        else:
            credits[key] = {**info[1], "modified": "Scaled to width 200px"}
            resolved += 1
            log.info("  %s: %s / %s", key, credits[key]["license"], credits[key]["author"])
        time.sleep(0.5)

    # --- Historic driver headshots (resolved through Wikidata) ---
    notable = WikidataHeadshotIngestor.NOTABLE_DRIVERS
    pending = [
        ref
        for ref in notable
        if (HEADSHOTS_DIR / f"{ref}.png").exists()
        and (args.refresh or f"headshots/{ref}.png" not in credits)
    ]

    if pending:
        images = wikidata_image_urls()
        for ref in pending:
            key = f"headshots/{ref}.png"
            image_url = images.get(notable[ref])
            if not image_url:
                missing.append(key)
                log.warning("  %s: no Wikidata image", ref)
                continue

            info = _wikimedia_file_info(image_url, width=max(HEADSHOT_SIZE) * 3)
            if not info:
                missing.append(key)
                log.warning("  %s: could not resolve via Commons", ref)
            else:
                credits[key] = {**info[1], "modified": "Cropped and resized"}
                resolved += 1
                log.info("  %s: %s / %s", key, credits[key]["license"], credits[key]["author"])
            time.sleep(1)

    _save_credits(credits)
    log.info(
        "\nWrote %s (%d entries, %d resolved this run, was %d)",
        WIKIMEDIA_CREDITS_PATH,
        len(credits),
        resolved,
        before,
    )

    if missing:
        log.warning(
            "\n%d image(s) on disk could not be attributed:\n  %s\n"
            "Unattributable images should be removed rather than shipped.",
            len(missing),
            "\n  ".join(missing),
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
