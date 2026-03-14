"""Ingest driver headshots from OpenF1 and constructor colors."""

import json
import pathlib
import urllib.request

from sqlalchemy import select

from src.db.models import Constructor, Driver
from src.ingestion.base import BaseIngestor

OPENF1_DRIVERS_URL = "https://api.openf1.org/v1/drivers?session_key=latest"

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
    "brm": "#006633",
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


HEADSHOTS_DIR = pathlib.Path(__file__).resolve().parents[3] / "apps" / "web" / "public" / "headshots"


class DriverHeadshotIngestor(BaseIngestor):
    def ingest(self) -> None:
        # Check if any driver already has a headshot downloaded
        has_local = self.db.scalar(
            select(Driver).where(Driver.has_headshot.is_(True)).limit(1)
        )
        if has_local:
            self.log("Skipping — driver headshots already downloaded")
            return

        self.log("Fetching driver headshots from OpenF1...")

        try:
            req = urllib.request.Request(OPENF1_DRIVERS_URL)
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
        except Exception as e:
            self.log(f"Warning: Failed to fetch OpenF1 data: {e}")
            return

        HEADSHOTS_DIR.mkdir(parents=True, exist_ok=True)

        # Build name → driver lookup from DB
        all_drivers = self.db.execute(
            select(Driver)
        ).scalars().all()
        name_to_driver: dict[str, Driver] = {}
        for d in all_drivers:
            key = f"{d.first_name.lower()} {d.last_name.lower()}"
            name_to_driver[key] = d

        updated = 0
        for entry in data:
            first = entry.get("first_name", "")
            last = entry.get("last_name", "")
            headshot = entry.get("headshot_url")

            if not headshot or not first or not last:
                continue

            key = f"{first.lower()} {last.lower()}"
            driver = name_to_driver.get(key)
            if not driver:
                continue

            # Download image locally
            local_path = HEADSHOTS_DIR / f"{driver.ref}.png"
            try:
                urllib.request.urlretrieve(headshot, local_path)
            except Exception as e:
                self.log(f"Warning: Failed to download headshot for {driver.ref}: {e}")
                continue

            driver.has_headshot = True
            updated += 1

        self.db.commit()
        self.log(f"Downloaded headshots for {updated} drivers")


class ConstructorColorIngestor(BaseIngestor):
    def ingest(self) -> None:
        # Check if any constructor has a color set
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
