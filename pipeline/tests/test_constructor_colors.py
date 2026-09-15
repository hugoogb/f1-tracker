"""The palette has to keep up with the grid.

Colours are how every chart and table tells teams apart, so a constructor
without one is a visible regression rather than a cosmetic gap. Two rules are
worth holding: the teams anyone recognises keep a hand-curated livery, and
everyone else still comes out of the ingest with *something* — a shade of their
national racing colour rather than the default grey.
"""

import pytest

from src.db.models import Constructor
from src.ingestion.colors import (
    CONSTRUCTOR_COLORS,
    NATIONAL_RACING_COLORS,
    ConstructorColorIngestor,
    derive_color,
)

# Teams on the grid in the seasons the site leads with. `rb`/`sauber` are the
# pre-rename ids for two of them and are covered by the palette separately.
CURRENT_GRID = (
    "mclaren",
    "red-bull",
    "ferrari",
    "mercedes",
    "aston-martin",
    "alpine",
    "williams",
    "haas",
    "racing-bulls",
    "kick-sauber",
    "audi",
    "cadillac",
)

# Every constructors' champion in f1db. A derived national shade is fine for a
# privateer nobody has a photograph of, but not for these — if one of them ever
# falls out of the palette the fallback would hide it, so assert it directly.
CHAMPIONS = (
    "benetton",
    "brabham",
    "brawn",
    "brm",
    "cooper",
    "ferrari",
    "lotus",
    "matra",
    "mclaren",
    "mercedes",
    "red-bull",
    "renault",
    "tyrrell",
    "vanwall",
    "williams",
)


@pytest.mark.parametrize("ref", CURRENT_GRID)
def test_current_grid_has_a_curated_colour(ref):
    assert ref in CONSTRUCTOR_COLORS, f"{ref} would fall back to its national racing colour"


@pytest.mark.parametrize("ref", CHAMPIONS)
def test_champions_have_a_curated_colour(ref):
    assert ref in CONSTRUCTOR_COLORS, f"{ref} would fall back to its national racing colour"


@pytest.mark.parametrize("code", sorted(NATIONAL_RACING_COLORS))
def test_every_national_colour_derives_a_valid_shade(code):
    color = derive_color("some-constructor", code)
    assert color is not None
    assert len(color) == 7 and color.startswith("#")
    int(color[1:], 16)  # raises if the derivation produced anything but hex


def test_derive_color_is_stable_across_calls():
    """A ref's colour must not move between ingests.

    The derivation is hashed rather than randomised precisely so that a reader
    sees the same team in the same colour next week, and so a weekly re-ingest
    does not rewrite a hundred rows for nothing.
    """
    first = derive_color("kurtis-kraft", "US")
    assert first == derive_color("kurtis-kraft", "US")
    assert first != derive_color("kuzma", "US")


def test_derive_color_separates_constructors_of_one_nationality():
    """Ten British privateers in one chart must not draw ten identical lines."""
    refs = ("alta", "connew", "emeryson", "era", "gilby", "jbw", "lec", "stevens")
    shades = {derive_color(ref, "GB") for ref in refs}
    assert len(shades) == len(refs)


def test_derive_color_without_a_country_is_grey():
    assert derive_color("mystery-team", None) is None
    assert derive_color("mystery-team", "ZZ") is None


def test_ingest_colours_a_constructor_added_after_the_first_load(db):
    """A team joining later still gets its colour.

    The ingestor used to skip entirely once any constructor had a colour, so
    Audi and Cadillac stayed grey forever once 2025 had been loaded.
    """
    db.add_all(
        [
            Constructor(id="c-ferrari", ref="ferrari", name="Ferrari"),
            Constructor(id="c-audi", ref="audi", name="Audi"),
        ]
    )
    db.commit()

    ConstructorColorIngestor(db).ingest()
    assert db.get(Constructor, "c-ferrari").color == CONSTRUCTOR_COLORS["ferrari"]

    # Second run: nothing to change, and nothing lost.
    ConstructorColorIngestor(db).ingest()
    assert db.get(Constructor, "c-audi").color == CONSTRUCTOR_COLORS["audi"]


def test_ingest_falls_back_to_the_national_colour(db):
    """A constructor outside the palette is coloured, not left grey."""
    db.add(Constructor(id="c-hwm", ref="hwm", name="Hersham and Walton Motors", country_code="GB"))
    db.commit()

    ConstructorColorIngestor(db).ingest()
    assert db.get(Constructor, "c-hwm").color == derive_color("hwm", "GB")


def test_ingest_prefers_a_curated_livery_over_the_national_colour(db):
    db.add(Constructor(id="c-ferrari", ref="ferrari", name="Ferrari", country_code="IT"))
    db.commit()

    ConstructorColorIngestor(db).ingest()
    assert db.get(Constructor, "c-ferrari").color == CONSTRUCTOR_COLORS["ferrari"]


def test_ingest_leaves_a_constructor_with_no_country_grey(db):
    """The one case where grey is the honest answer."""
    db.add(Constructor(id="c-x", ref="not-a-real-team", name="Unknown"))
    db.commit()

    ConstructorColorIngestor(db).ingest()
    assert db.get(Constructor, "c-x").color is None


def test_ingest_is_idempotent_for_derived_colours(db):
    """A second run must not rewrite the rows the first one derived."""
    db.add(Constructor(id="c-hwm", ref="hwm", name="HWM", country_code="GB"))
    db.commit()

    ConstructorColorIngestor(db).ingest()
    first = db.get(Constructor, "c-hwm").color

    ConstructorColorIngestor(db).ingest()
    assert db.get(Constructor, "c-hwm").color == first
