"""Load the f1db dataset release.

f1db (https://github.com/f1db/f1db) publishes the complete Formula 1 record —
1950 to present — as versioned release artifacts under CC BY 4.0. This module
downloads the single-file JSON artifact once, caches it, and hands the parsed
document to the transform ingestors.

Unlike the HTTP API it replaces, this is one download per release rather than
thousands of rate-limited calls, so there is no throttling to observe here.
"""

import json
import logging
import pathlib
import urllib.request
import zipfile
from typing import Any

from src.config import settings

logger = logging.getLogger(__name__)

ARTIFACT = "f1db-json-single.zip"
JSON_NAME = "f1db.json"

# Identifies the project to GitHub, as a courtesy to the release host.
USER_AGENT = "F1Tracker/1.0 (https://github.com/hugoogb/f1-tracker)"


def _release_url(version: str) -> str:
    if version == "latest":
        return f"https://github.com/f1db/f1db/releases/latest/download/{ARTIFACT}"
    tag = version if version.startswith("v") else f"v{version}"
    return f"https://github.com/f1db/f1db/releases/download/{tag}/{ARTIFACT}"


def _cache_path(version: str) -> pathlib.Path:
    directory = pathlib.Path(settings.f1db_cache_dir)
    directory.mkdir(parents=True, exist_ok=True)
    return directory / f"{version}-{ARTIFACT}"


def download(version: str | None = None, force: bool = False) -> pathlib.Path:
    """Fetch the f1db release archive, returning the cached path.

    A cached archive is reused unless `force` is set. "latest" is always
    re-fetched, since the tag it points at moves after every race.
    """
    version = version or settings.f1db_version
    dest = _cache_path(version)

    if dest.exists() and not force and version != "latest":
        logger.info(f"Using cached f1db archive: {dest}")
        return dest

    url = _release_url(version)
    logger.info(f"Downloading f1db {version} from {url}")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=300) as response:
        payload = response.read()
    dest.write_bytes(payload)
    logger.info(f"Downloaded {len(payload) / 1_000_000:.1f} MB → {dest}")
    return dest


class F1DBData:
    """Parsed f1db release, with lookup indexes over the entities we consume."""

    def __init__(self, raw: dict[str, Any]) -> None:
        self.raw = raw
        self.countries: dict[str, dict] = {c["id"]: c for c in raw.get("countries", [])}
        self.grands_prix: dict[str, dict] = {g["id"]: g for g in raw.get("grandsPrix", [])}
        self.drivers: list[dict] = raw.get("drivers", [])
        self.constructors: list[dict] = raw.get("constructors", [])
        self.circuits: list[dict] = raw.get("circuits", [])
        self.seasons: list[dict] = raw.get("seasons", [])
        self.races: list[dict] = raw.get("races", [])

    # --- Country helpers -------------------------------------------------
    # f1db carries alpha2Code and demonym per country, which map directly onto
    # our country_code and nationality columns.

    def nationality(self, country_id: str | None) -> str | None:
        country = self.countries.get(country_id or "")
        return country.get("demonym") if country else None

    def country_name(self, country_id: str | None) -> str | None:
        country = self.countries.get(country_id or "")
        return country.get("name") if country else None

    def alpha2(self, country_id: str | None) -> str | None:
        country = self.countries.get(country_id or "")
        code = country.get("alpha2Code") if country else None
        return code.upper() if code else None

    def grand_prix_name(self, grand_prix_id: str | None) -> str | None:
        gp = self.grands_prix.get(grand_prix_id or "")
        return gp.get("fullName") or gp.get("name") if gp else None

    def races_for(self, year_range: tuple[int, int] | None = None) -> list[dict]:
        """Races, optionally limited to an inclusive season range."""
        if year_range is None:
            return self.races
        lo, hi = year_range
        return [r for r in self.races if lo <= r["year"] <= hi]


_cache: dict[str, F1DBData] = {}


def load(version: str | None = None, force_download: bool = False) -> F1DBData:
    """Load (and memoise) the f1db release for this process.

    The parsed document is ~85 MB, so every ingestor in a run shares one copy.
    """
    version = version or settings.f1db_version
    if version in _cache and not force_download:
        return _cache[version]

    archive = download(version, force=force_download)
    logger.info("Parsing f1db archive...")
    with zipfile.ZipFile(archive) as zf:
        with zf.open(JSON_NAME) as fh:
            raw = json.load(fh)

    data = F1DBData(raw)
    logger.info(
        f"Loaded f1db: {len(data.seasons)} seasons, {len(data.races)} races, "
        f"{len(data.drivers)} drivers, {len(data.constructors)} constructors, "
        f"{len(data.circuits)} circuits"
    )
    _cache[version] = data
    return data
