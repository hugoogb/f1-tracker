"""Ingest driver headshots, constructor logos, and constructor colors."""

import io
import json
import pathlib
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image
from sqlalchemy import select

from src.db.models import Constructor, Driver
from src.ingestion.base import BaseIngestor

# --- Paths ---
PUBLIC_DIR = pathlib.Path(__file__).resolve().parents[3] / "apps" / "web" / "public"
HEADSHOTS_DIR = PUBLIC_DIR / "headshots"
LOGOS_DIR = PUBLIC_DIR / "logos"

# --- OpenF1 ---
OPENF1_BASE = "https://api.openf1.org/v1"
# Fetch one race session per year to discover unique drivers with headshots
OPENF1_YEARS = [2023, 2024, 2025]

# --- TheSportsDB ---
SPORTSDB_BASE = "https://www.thesportsdb.com/api/v1/json/3"

# TheSportsDB team name (from search endpoint) → Ergast constructor ref
# The free tier only supports search_all_teams by league, not individual lookups
SPORTSDB_NAME_TO_REF: dict[str, str] = {
    "Scuderia Ferrari HP": "ferrari",
    "McLaren Formula 1 Team": "mclaren",
    "Oracle Red Bull Racing": "red_bull",
    "Mercedes-AMG PETRONAS Formula One Team": "mercedes",
    "Aston Martin Aramco Formula One Team": "aston_martin",
    "BWT Alpine Formula One Team": "alpine",
    "Williams Racing": "williams",
    "MoneyGram Haas F1 Team": "haas",
    "Visa Cash App Racing Bulls Formula One Team": "rb",
    "Audi Revolut F1 Team": "sauber",
}

# --- Wikidata ---
WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"
WIKIDATA_QUERY = """
SELECT ?driverLabel ?image WHERE {
  ?driver wdt:P106 wd:Q10841764 .
  ?driver wdt:P18 ?image .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
"""

# Headshot target size (matches OpenF1 headshots)
HEADSHOT_SIZE = (93, 93)

# Historical and current constructor colors (Ergast ref → hex color)
# Sources: OpenF1 team_colour, TeamColorCodes.com, historical research
CONSTRUCTOR_COLORS: dict[str, str] = {
    # === 2025 grid (from OpenF1) ===
    "mclaren": "#F47600",
    "red_bull": "#4781D7",
    "ferrari": "#ED1131",
    "mercedes": "#00D7B6",
    "aston_martin": "#229971",
    "alpine": "#00A1E8",
    "williams": "#1868DB",
    "haas": "#9C9FA2",
    "rb": "#6C98FF",
    "sauber": "#F50537",
    # === Recent teams (2010s-2020s) ===
    "alphatauri": "#4E7C9B",
    "toro_rosso": "#1E5BC6",
    "racing_point": "#F596C8",
    "force_india": "#F596C8",
    "renault": "#FFF500",
    "caterham": "#005030",
    "marussia": "#ED1131",
    "manor": "#ED1131",
    "lotus_f1": "#FFB800",
    "hrt": "#A08250",
    "virgin": "#C82E37",
    # === 2000s ===
    "brawn": "#B5F500",
    "toyota": "#CC0000",
    "bmw_sauber": "#0066B1",
    "honda": "#CC0000",
    "super_aguri": "#CC0000",
    "spyker": "#F57E20",
    "midland": "#CC0000",
    "jordan": "#FDD000",
    "minardi": "#191919",
    "jaguar": "#006633",
    "bar": "#CC0000",
    "prost": "#003399",
    "arrows": "#FF8700",
    # === 1990s ===
    "benetton": "#009E49",
    "tyrrell": "#00246B",
    "ligier": "#0066CC",
    "footwork": "#FFB800",
    "larrousse": "#003399",
    "pacific": "#003399",
    "simtek": "#800080",
    "forti": "#FFD700",
    "lola": "#8B0000",
    # === 1980s ===
    "brabham": "#003300",
    "lotus": "#1A1A1A",
    "osella": "#FF4500",
    "toleman": "#1E90FF",
    "ags": "#003399",
    "zakspeed": "#CC0000",
    "rial": "#003399",
    "coloni": "#FFD700",
    "eurobrun": "#003399",
    "onyx": "#1A1A1A",
    "dallara": "#CC0000",
    "leyton_house": "#00CED1",
    "march": "#007BA7",
    # === 1970s ===
    "matra": "#003399",
    "brm": "#006633",
    "surtees": "#CC0000",
    "hesketh": "#FFFFFF",
    "shadow": "#1A1A1A",
    "wolf": "#FF4500",
    "penske": "#CC0000",
    "ensign": "#006633",
    "theodore": "#CC0000",
    "fittipaldi": "#FFD700",
    "ats": "#003399",
    "kauhsen": "#FF4500",
    "rebaque": "#CC0000",
    "merzario": "#CC0000",
    # === 1960s ===
    "cooper": "#006633",
    "vanwall": "#006633",
    "eagle": "#003399",
    "honda_f1": "#CC0000",
    # === Classic ===
    "alfa": "#8B0000",
    "alfa_romeo": "#8B0000",
    "porsche": "#8B8B8B",
    "maserati": "#CC0000",
    "gordini": "#003399",
    "lancia": "#8B0000",
    "connaught": "#006633",
    "bugatti": "#003399",
}


def _fetch_json(url: str, timeout: int = 30) -> list | dict | None:
    """Fetch JSON from a URL, returning None on failure."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "F1Tracker/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def _download_file(url: str, dest: pathlib.Path) -> bool:
    """Download a file, returning True on success."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "F1Tracker/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            dest.write_bytes(resp.read())
        return True
    except Exception:
        return False


COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKIMEDIA_UA = "F1TrackerBot/1.0 (https://github.com/hugoogb/f1-tracker)"


def _wikimedia_thumb_url(file_path_url: str, width: int = 200) -> str | None:
    """Get a thumbnail URL via the Commons API.

    Wikimedia rate-limits direct/Special:FilePath URLs for bulk access.
    The API endpoint is the recommended way to get thumbnails.
    Returns None if the file is not found.
    """
    filename_encoded = file_path_url.rsplit("/", 1)[-1]
    filename = urllib.parse.unquote(filename_encoded).replace(" ", "_")

    api_url = (
        f"{COMMONS_API}?action=query"
        f"&titles=File:{urllib.parse.quote(filename)}"
        f"&prop=imageinfo&iiprop=url&iiurlwidth={width}&format=json"
    )
    try:
        req = urllib.request.Request(api_url, headers={"User-Agent": WIKIMEDIA_UA})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            thumb = page.get("imageinfo", [{}])[0].get("thumburl")
            if thumb:
                return thumb
    except Exception:
        pass
    return None


def _download_and_resize(url: str, dest: pathlib.Path, size: tuple[int, int]) -> str | None:
    """Download an image, resize/crop to a square, and save as PNG.

    Returns None on success, or an error message on failure.
    """
    # Use Commons API to get a proper thumbnail URL (avoids 429 rate limits)
    if "Special:FilePath" in url:
        thumb = _wikimedia_thumb_url(url, width=max(size) * 3)
        if not thumb:
            return "Could not resolve thumbnail URL via Commons API"
        url = thumb

    try:
        req = urllib.request.Request(url, headers={"User-Agent": WIKIMEDIA_UA})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        img = Image.open(io.BytesIO(data))
        img = img.convert("RGB")
        # Center-crop to square
        w, h = img.size
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        img = img.crop((left, top, left + side, top + side))
        img = img.resize(size, Image.LANCZOS)
        img.save(dest, "PNG")
        return None
    except Exception as exc:
        return str(exc)


class DriverHeadshotIngestor(BaseIngestor):
    """Fetch driver headshots from OpenF1 across multiple seasons (2023+)."""

    def ingest(self) -> None:
        self.log("Fetching driver headshots from OpenF1 (2023-2025)...")
        HEADSHOTS_DIR.mkdir(parents=True, exist_ok=True)

        # Build name → driver lookup from DB (only drivers without headshots)
        drivers_without = self.db.execute(
            select(Driver).where(Driver.has_headshot.is_(False))
        ).scalars().all()

        if not drivers_without:
            self.log("All drivers already have headshots, skipping OpenF1")
            return

        name_to_driver: dict[str, Driver] = {}
        for d in drivers_without:
            key = f"{d.first_name.lower()} {d.last_name.lower()}"
            name_to_driver[key] = d

        # Collect unique drivers with headshots across sessions
        seen_names: set[str] = set()
        entries_to_download: list[tuple[str, str]] = []  # (name_key, headshot_url)

        for year in OPENF1_YEARS:
            # Get first race session of the year
            sessions = _fetch_json(
                f"{OPENF1_BASE}/sessions?session_type=Race&year={year}"
            )
            if not sessions:
                self.log(f"Warning: No sessions found for {year}")
                continue

            session_key = sessions[0].get("session_key")
            if not session_key:
                continue

            drivers = _fetch_json(f"{OPENF1_BASE}/drivers?session_key={session_key}")
            if not drivers:
                continue

            for entry in drivers:
                first = entry.get("first_name", "")
                last = entry.get("last_name", "")
                headshot = entry.get("headshot_url")

                if not headshot or not first or not last:
                    continue

                key = f"{first.lower()} {last.lower()}"
                if key in seen_names:
                    continue
                seen_names.add(key)

                if key in name_to_driver:
                    entries_to_download.append((key, headshot))

        # Download headshots
        updated = 0
        failed = 0
        for name_key, headshot_url in entries_to_download:
            driver = name_to_driver[name_key]
            local_path = HEADSHOTS_DIR / f"{driver.ref}.png"
            if _download_file(headshot_url, local_path):
                driver.has_headshot = True
                updated += 1
            else:
                failed += 1

        self.db.commit()
        msg = f"Downloaded {updated} headshots from OpenF1"
        if failed:
            msg += f" ({failed} failed)"
        self.log(msg)


class WikidataHeadshotIngestor(BaseIngestor):
    """Fetch photos for top F1 drivers from Wikidata/Wikimedia Commons."""

    # Top ~100 drivers by historical significance (champions + notable)
    # Ergast ref → Wikidata display name for matching
    NOTABLE_DRIVERS: dict[str, str] = {
        # World Champions
        "fangio": "Juan Manuel Fangio",
        "farina": "Giuseppe Farina",
        "ascari": "Alberto Ascari",
        "hawthorn": "Mike Hawthorn",
        "jack_brabham": "Jack Brabham",
        "phil_hill": "Phil Hill",
        "hill": "Graham Hill",
        "clark": "Jim Clark",
        "surtees": "John Surtees",
        "hulme": "Denny Hulme",
        "stewart": "Jackie Stewart",
        "rindt": "Jochen Rindt",
        "emerson_fittipaldi": "Emerson Fittipaldi",
        "lauda": "Niki Lauda",
        "hunt": "James Hunt",
        "andretti": "Mario Andretti",
        "scheckter": "Jody Scheckter",
        "jones": "Alan Jones",
        "piquet": "Nelson Piquet",
        "keke_rosberg": "Keke Rosberg",
        "prost": "Alain Prost",
        "senna": "Ayrton Senna",
        "mansell": "Nigel Mansell",
        "michael_schumacher": "Michael Schumacher",
        "damon_hill": "Damon Hill",
        "villeneuve": "Jacques Villeneuve",
        "hakkinen": "Mika Häkkinen",
        "raikkonen": "Kimi Räikkönen",
        "alonso": "Fernando Alonso",
        "button": "Jenson Button",
        "vettel": "Sebastian Vettel",
        "hamilton": "Lewis Hamilton",
        "rosberg": "Nico Rosberg",
        "max_verstappen": "Max Verstappen",
        # Notable non-champions
        "moss": "Stirling Moss",
        "coulthard": "David Coulthard",
        "barrichello": "Rubens Barrichello",
        "webber": "Mark Webber",
        "montoya": "Juan Pablo Montoya",
        "massa": "Felipe Massa",
        "kubica": "Robert Kubica",
        "ricciardo": "Daniel Ricciardo",
        "ralf_schumacher": "Ralf Schumacher",
        "heidfeld": "Nick Heidfeld",
        "trulli": "Jarno Trulli",
        "fisichella": "Giancarlo Fisichella",
        "irvine": "Eddie Irvine",
        "patrese": "Riccardo Patrese",
        "berger": "Gerhard Berger",
        "arnoux": "René Arnoux",
        "villeneuve_sr": "Gilles Villeneuve",
        "peterson": "Ronnie Peterson",
        "regazzoni": "Clay Regazzoni",
        "ickx": "Jacky Ickx",
        "cevert": "François Cevert",
        "gurney": "Dan Gurney",
        "brooks": "Tony Brooks",
        "collins": "Peter Collins",
        "gonzalez": "José Froilán González",
        "depailler": "Patrick Depailler",
        "pironi": "Didier Pironi",
        "tambay": "Patrick Tambay",
        "de_angelis": "Elio de Angelis",
        "warwick": "Derek Warwick",
        "herbert": "Johnny Herbert",
        "wurz": "Alexander Wurz",
        "sato": "Takuma Sato",
        "kobayashi": "Kamui Kobayashi",
        "perez": "Sergio Pérez",
        "bottas": "Valtteri Bottas",
        "sainz": "Carlos Sainz",
        "leclerc": "Charles Leclerc",
        "norris": "Lando Norris",
        "russell": "George Russell",
        "gasly": "Pierre Gasly",
        "ocon": "Esteban Ocon",
        "tsunoda": "Yuki Tsunoda",
        "stroll": "Lance Stroll",
        "albon": "Alexander Albon",
        "piastri": "Oscar Piastri",
        "hulkenberg": "Nico Hülkenberg",
        "magnussen": "Kevin Magnussen",
        "grosjean": "Romain Grosjean",
        "maldonado": "Pastor Maldonado",
        "kvyat": "Daniil Kvyat",
        "giovinazzi": "Antonio Giovinazzi",
        "zhou": "Zhou Guanyu",
        "de_vries": "Nyck de Vries",
        "lawson": "Liam Lawson",
        "bearman": "Oliver Bearman",
    }

    def ingest(self) -> None:
        # Only process notable drivers that still need headshots
        refs_to_fetch = []
        for ref in self.NOTABLE_DRIVERS:
            driver = self.db.execute(
                select(Driver).where(Driver.ref == ref, Driver.has_headshot.is_(False))
            ).scalar_one_or_none()
            if driver:
                refs_to_fetch.append(ref)

        if not refs_to_fetch:
            self.log("All notable drivers have headshots, skipping Wikidata")
            return

        self.log(f"Fetching headshots for {len(refs_to_fetch)} notable drivers from Wikidata...")
        HEADSHOTS_DIR.mkdir(parents=True, exist_ok=True)

        # Query Wikidata for all F1 drivers with images (fast, ~1s)
        encoded = urllib.parse.urlencode({"query": WIKIDATA_QUERY, "format": "json"})
        data = _fetch_json(f"{WIKIDATA_SPARQL_URL}?{encoded}", timeout=60)
        if not data or "results" not in data:
            self.log("Warning: Wikidata SPARQL query failed")
            return

        # Build name → image URL lookup from Wikidata results
        wikidata_images: dict[str, str] = {}
        for result in data["results"]["bindings"]:
            name = result.get("driverLabel", {}).get("value", "")
            image_url = result.get("image", {}).get("value", "")
            if name and image_url and name not in wikidata_images:
                wikidata_images[name] = image_url

        self.log(f"Wikidata has {len(wikidata_images)} unique driver images")

        updated = 0
        failed = 0
        not_found = 0

        for ref in refs_to_fetch:
            wikidata_name = self.NOTABLE_DRIVERS[ref]
            image_url = wikidata_images.get(wikidata_name)

            if not image_url:
                self.log(f"  {ref}: no Wikidata image found")
                not_found += 1
                continue

            driver = self.db.execute(
                select(Driver).where(Driver.ref == ref)
            ).scalar_one()

            local_path = HEADSHOTS_DIR / f"{ref}.png"
            err = _download_and_resize(image_url, local_path, HEADSHOT_SIZE)
            if err is None:
                driver.has_headshot = True
                updated += 1
                self.log(f"  {ref}: downloaded")
            else:
                failed += 1
                self.log(f"  {ref}: failed — {err}")

            # Delay to avoid Wikimedia 429 rate limiting
            time.sleep(1)

        self.db.commit()
        self.log(
            f"Downloaded {updated} headshots from Wikidata "
            f"({not_found} not on Wikidata, {failed} failed)"
        )


class ConstructorLogoIngestor(BaseIngestor):
    """Fetch constructor logos/badges from TheSportsDB search endpoint."""

    def ingest(self) -> None:
        self.log("Fetching constructor logos from TheSportsDB...")
        LOGOS_DIR.mkdir(parents=True, exist_ok=True)

        # Use search endpoint (free tier) — lookupteam is paywalled
        data = _fetch_json(
            f"{SPORTSDB_BASE}/search_all_teams.php?l=Formula_1"
        )
        if not data or not data.get("teams"):
            self.log("Warning: TheSportsDB search returned no teams")
            return

        updated = 0
        skipped = 0

        for team in data["teams"]:
            team_name = team.get("strTeam", "")
            ref = SPORTSDB_NAME_TO_REF.get(team_name)
            if not ref:
                continue

            constructor = self.db.execute(
                select(Constructor).where(Constructor.ref == ref)
            ).scalar_one_or_none()
            if not constructor:
                continue

            # Skip if already has a valid logo
            local_path = LOGOS_DIR / f"{ref}.png"
            if constructor.has_logo and local_path.exists():
                skipped += 1
                continue

            badge_url = team.get("strBadge")
            if not badge_url:
                self.log(f"  {ref}: no badge URL")
                continue

            if _download_file(badge_url, local_path):
                constructor.has_logo = True
                updated += 1
                self.log(f"  {ref}: downloaded")
            else:
                self.log(f"  {ref}: download failed")

        self.db.commit()
        msg = f"Downloaded logos for {updated} constructors"
        if skipped:
            msg += f" ({skipped} already had logos)"
        self.log(msg)


class ConstructorColorIngestor(BaseIngestor):
    def ingest(self) -> None:
        has_colors = self.db.scalar(
            select(Constructor).where(Constructor.color.isnot(None)).limit(1)
        )
        if has_colors:
            self.log("Skipping — constructor colors already loaded")
            return

        self.log(f"Loading colors for {len(CONSTRUCTOR_COLORS)} constructors...")
        updated = 0
        missing = []

        for ref, color in CONSTRUCTOR_COLORS.items():
            constructor = self.db.execute(
                select(Constructor).where(Constructor.ref == ref)
            ).scalar_one_or_none()

            if constructor:
                constructor.color = color
                updated += 1
            else:
                missing.append(ref)

        self.db.commit()

        if missing:
            self.log(f"Note: {len(missing)} refs not in DB: {missing[:10]}...")
        self.log(f"Updated colors for {updated} constructors")
