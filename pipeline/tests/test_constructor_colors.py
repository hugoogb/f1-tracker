"""The palette has to keep up with the grid.

Colours are how every chart and table tells teams apart, so a constructor
without one is a visible regression rather than a cosmetic gap.
"""

import pytest

from src.db.models import Constructor
from src.ingestion.colors import CONSTRUCTOR_COLORS, ConstructorColorIngestor

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


@pytest.mark.parametrize("ref", CURRENT_GRID)
def test_current_grid_has_a_colour(ref):
    assert ref in CONSTRUCTOR_COLORS, f"{ref} would render in the default grey"


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


def test_ingest_leaves_constructors_outside_the_palette_alone(db):
    db.add(Constructor(id="c-x", ref="not-a-real-team", name="Unknown"))
    db.commit()

    ConstructorColorIngestor(db).ingest()
    assert db.get(Constructor, "c-x").color is None
