"""Ingest constructor colors.

The palette is curated in-repo rather than fetched at runtime, so no third-party
API is called. Individual color values are facts about team liveries, not
creative expression, and carry no licence obligations of their own.
"""

from sqlalchemy import select

from src.db.models import Constructor
from src.ingestion.base import BaseIngestor

# Historical and current constructor colors (constructor ref → hex color)
# Compiled from published team liveries and historical reference material.
CONSTRUCTOR_COLORS: dict[str, str] = {
    # === Current grid ===
    # f1db renames a team when it rebrands and keeps the old id for the seasons
    # it raced under, so a team can need several entries: "rb" and
    # "racing-bulls" are the same outfit either side of the 2025 rename, as are
    # "sauber", "kick-sauber" and its 2026 successor "audi".
    "mclaren": "#F47600",
    "red-bull": "#4781D7",
    "ferrari": "#ED1131",
    "mercedes": "#00D7B6",
    "aston-martin": "#229971",
    "alpine": "#00A1E8",
    "williams": "#1868DB",
    "haas": "#9C9FA2",
    "racing-bulls": "#6C98FF",
    "kick-sauber": "#00E700",
    "audi": "#009597",
    "cadillac": "#B4975A",
    "rb": "#6C98FF",
    "sauber": "#F50537",
    # === Recent teams (2010s-2020s) ===
    "alphatauri": "#4E7C9B",
    "toro-rosso": "#1E5BC6",
    "racing-point": "#F596C8",
    "force-india": "#F596C8",
    "renault": "#FFF500",
    "caterham": "#005030",
    "marussia": "#ED1131",
    "manor": "#ED1131",
    "lotus-f1": "#FFB800",
    "hrt": "#A08250",
    "virgin": "#C82E37",
    # === 2000s ===
    "brawn": "#B5F500",
    "toyota": "#CC0000",
    "bmw-sauber": "#0066B1",
    "honda": "#CC0000",
    "super-aguri": "#CC0000",
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
    "leyton-house": "#00CED1",
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
    # === Classic ===
    "alfa-romeo": "#8B0000",
    "porsche": "#8B8B8B",
    "maserati": "#CC0000",
    "gordini": "#003399",
    "lancia": "#8B0000",
    "connaught": "#006633",
    "bugatti": "#003399",
}


class ConstructorColorIngestor(BaseIngestor):
    def ingest(self) -> None:
        """Apply the palette to any constructor whose stored colour is out of date.

        This used to bail out as soon as *any* constructor had a colour, which
        meant a team joining the grid later — Audi and Cadillac for 2026 — never
        got one and rendered grey everywhere for the rest of the dataset's life.
        Loading the palette's constructors in one query and writing only what
        differs is just as cheap, and stays idempotent across re-ingests.
        """

        self.log(f"Loading colors for {len(CONSTRUCTOR_COLORS)} constructors...")

        known = {
            c.ref: c
            for c in self.db.execute(
                select(Constructor).where(Constructor.ref.in_(CONSTRUCTOR_COLORS))
            )
            .scalars()
            .all()
        }

        updated = 0
        for ref, color in CONSTRUCTOR_COLORS.items():
            constructor = known.get(ref)
            if constructor is not None and constructor.color != color:
                constructor.color = color
                updated += 1

        missing = [ref for ref in CONSTRUCTOR_COLORS if ref not in known]
        self.db.commit()

        if missing:
            # Loud on purpose: a ref that stops matching (e.g. an Ergast-style
            # "red_bull" against f1db's "red-bull") silently drops a team back to
            # the default colour, which is easy to miss in the UI.
            self.log(
                f"WARNING: {len(missing)} color refs are not constructor ids "
                f"and were skipped: {sorted(missing)[:10]}"
            )
        self.log(f"Updated colors for {updated} of {len(known)} matched constructors")
