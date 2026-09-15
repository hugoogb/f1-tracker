"""Ingest constructor colors.

The palette is curated in-repo rather than fetched at runtime, so no third-party
API is called. Individual color values are facts about team liveries, not
creative expression, and carry no licence obligations of their own.

Colour is how every chart and table tells constructors apart, so "no colour" is
not a neutral state — it is a grey line in a chart of grey lines. f1db carries
187 constructors and only the ones anyone has a livery record for can be curated
by hand, which left most of the 1950s and 60s field sharing the default grey.
So there are two tiers:

1. `CONSTRUCTOR_COLORS` — a hand-curated livery, for teams where one is actually
   known. This is the only tier that claims to be a fact about a real car.
2. `derive_color()` — a shade of the constructor's national racing colour, for
   everyone else. Before sponsorship liveries arrived in 1968 cars really were
   painted by nationality (British green, rosso corsa, bleu de France, German
   silver), so the family is right even when the exact hue is ours; the per-ref
   variation inside it is there so two British privateers in the same 1961 grid
   do not draw the same line.

A constructor whose country f1db does not give stays grey, and the ingest says
so — inventing a colour with nothing behind it would be worse than the gap.
"""

import colorsys
import hashlib

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
    # === Added with the national-colour fallback ===
    # Teams whose livery is a matter of record, so they are curated rather than
    # derived. Everything else that was grey before now comes from its country.
    #
    # f1db's own chronology has lotus-racing (2010-11) and caterham (2012-14) as
    # one continuous entry, so they share a colour the way rb/racing-bulls do.
    "lotus-racing": "#005030",
    # Stewart ran white cars with the Racing Stewart tartan. The white itself is
    # unusable — a chart line in it disappears against the light theme — so this
    # is the tartan's navy.
    "stewart": "#0F3D7C",
    # Williams under Marlboro colours, 1973-74.
    "iso-marlboro": "#D42E12",
}

# FIA international racing colours, by ISO 3166-1 alpha-2 — the shade a country's
# cars were painted before commercial liveries were permitted in 1968. Used as
# the base for `derive_color`, covering every country f1db attributes a
# constructor to.
NATIONAL_RACING_COLORS: dict[str, str] = {
    "GB": "#00563F",  # British racing green
    "IT": "#D40000",  # rosso corsa
    "FR": "#0055A4",  # bleu de France
    # Silver, with a hint of blue in it. A truly neutral grey has hue 0 by
    # convention, so the variation below would swing it through pinks and
    # browns; a cool base keeps the whole German family in steel tones.
    "DE": "#AEB4BC",  # silver
    "US": "#2B4B9B",  # white with blue stripes
    "BE": "#F4C300",  # jaune de Belgique
    "CH": "#D52B1E",
    "NL": "#FF6C00",
    "JP": "#E4002B",
    "ES": "#C60B1E",
    "BR": "#009739",
    "AR": "#6CACE4",
    "AU": "#00843D",  # green and gold
    "NZ": "#33373D",  # black with the silver fern; cooled for the same reason
    "ZA": "#007A4D",
    "CA": "#D52B1E",
    "MX": "#006847",
    "IE": "#169B62",
    "AT": "#D6001C",
    "MY": "#006B3F",
    "IN": "#FF9933",
    "RU": "#0039A6",
    "HK": "#DE2910",
}

# How far a derived shade may travel from its national base. Wide enough that a
# dozen constructors of one nationality stay apart in a chart legend, narrow
# enough that they still read as that nationality.
#
# The spreads are additive around a centre rather than multiplied through the
# base, because a multiplier collapses at both ends of the scale: British racing
# green is so dark that every shade of it clamped to the same floor, and silver
# so light that ten German constructors came out the identical grey.
_HUE_SPREAD = 0.12
_LIGHTNESS_SPREAD = 0.34
_LIGHTNESS_CENTRE = (0.30, 0.56)
_LIGHTNESS_BOUNDS = (0.20, 0.74)
_SATURATION_SPREAD = 0.24
# Even an achromatic base gets a little saturation, so that hue has something to
# act on and the silver-era constructors do not separate on lightness alone.
_SATURATION_FLOOR = 0.10


def _hex_to_rgb(value: str) -> tuple[float, float, float]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def _rgb_to_hex(rgb: tuple[float, float, float]) -> str:
    return "#" + "".join(f"{round(channel * 255):02X}" for channel in rgb)


def _draws(ref: str) -> tuple[float, float, float]:
    """Three stable draws in [0, 1) from a constructor ref.

    Hashed rather than `hash()` so the same ref derives the same colour in every
    process and every run — otherwise each ingest would rewrite every derived
    constructor and the colour a reader saw last week would not be the one they
    see today.
    """
    digest = hashlib.blake2b(ref.encode("utf-8"), digest_size=6).digest()
    return tuple(  # type: ignore[return-value]
        int.from_bytes(digest[i : i + 2], "big") / 65536 for i in (0, 2, 4)
    )


def derive_color(ref: str, country_code: str | None) -> str | None:
    """A stable shade of the constructor's national racing colour.

    Returns None when f1db gives the constructor no country, which is the one
    case where grey is the honest answer.
    """
    base = NATIONAL_RACING_COLORS.get((country_code or "").upper())
    if base is None:
        return None

    hue, lightness, saturation = colorsys.rgb_to_hls(*_hex_to_rgb(base))
    hue_draw, lightness_draw, saturation_draw = _draws(ref)

    centre_lo, centre_hi = _LIGHTNESS_CENTRE
    floor, ceiling = _LIGHTNESS_BOUNDS
    lightness = min(max(lightness, centre_lo), centre_hi)
    saturation = max(saturation, _SATURATION_FLOOR)

    hue = (hue + (hue_draw - 0.5) * _HUE_SPREAD) % 1.0
    lightness = min(max(lightness + (lightness_draw - 0.5) * _LIGHTNESS_SPREAD, floor), ceiling)
    saturation = min(max(saturation + (saturation_draw - 0.5) * _SATURATION_SPREAD, 0.06), 1.0)

    return _rgb_to_hex(colorsys.hls_to_rgb(hue, lightness, saturation))


class ConstructorColorIngestor(BaseIngestor):
    def ingest(self) -> None:
        """Give every constructor a colour: curated where there is one, derived otherwise.

        This used to bail out as soon as *any* constructor had a colour, which
        meant a team joining the grid later — Audi and Cadillac for 2026 — never
        got one and rendered grey everywhere for the rest of the dataset's life.
        Walking every constructor and writing only what differs is just as cheap,
        and stays idempotent across re-ingests: a derived colour is a pure
        function of the ref and the country, so a second run changes nothing.
        """

        constructors = self.db.execute(select(Constructor)).scalars().all()
        self.log(f"Colouring {len(constructors)} constructors...")

        curated = derived = updated = 0
        uncoloured: list[str] = []

        for constructor in constructors:
            color = CONSTRUCTOR_COLORS.get(constructor.ref)
            if color is not None:
                curated += 1
            else:
                color = derive_color(constructor.ref, constructor.country_code)
                if color is None:
                    uncoloured.append(constructor.ref)
                    continue
                derived += 1

            if constructor.color != color:
                constructor.color = color
                updated += 1

        stored = {c.ref for c in constructors}
        unmatched = [ref for ref in CONSTRUCTOR_COLORS if ref not in stored]
        self.db.commit()

        if unmatched:
            # Loud on purpose: a ref that stops matching (e.g. an Ergast-style
            # "red_bull" against f1db's "red-bull") silently drops a team back to
            # its national shade, which is easy to miss in the UI.
            self.log(
                f"WARNING: {len(unmatched)} color refs are not constructor ids "
                f"and were skipped: {sorted(unmatched)[:10]}"
            )
        if uncoloured:
            # No country means no national colour to derive from, so these are
            # the only constructors left rendering grey. Add the country to
            # NATIONAL_RACING_COLORS if one has simply gone unmapped.
            self.log(
                f"WARNING: {len(uncoloured)} constructors have no country and stay "
                f"grey: {sorted(uncoloured)[:10]}"
            )
        self.log(
            f"Updated {updated} colors ({curated} curated, {derived} derived from "
            f"national racing colours)"
        )
