"""Driver code ingestion.

`Driver.code` (the three-letter abbreviation — VER, HAM) was hardcoded to None
in the ingestor even though Ergast supplies it, leaving the column empty for
every driver. Search matches on it and the UI displays it, so both were dead.
"""

from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from src.db.models import Constructor, Driver
from src.ingestion.drivers import ConstructorIngestor, DriverIngestor, _driver_code


class TestDriverCodeNormalization:
    def test_upper_cases_a_code(self):
        assert _driver_code("ver") == "VER"

    def test_trims_surrounding_whitespace(self):
        assert _driver_code("  HAM ") == "HAM"

    def test_missing_values_become_none(self):
        assert _driver_code(None) is None
        assert _driver_code(pd.NA) is None
        assert _driver_code("") is None
        assert _driver_code("   ") is None

    def test_non_strings_become_none(self):
        assert _driver_code(33) is None


def _driver_frame(rows):
    return pd.DataFrame(rows)


def _run_driver_ingest(db, frame, *, refresh=False):
    with patch("src.ingestion.drivers.Ergast", return_value=MagicMock()):
        with patch("src.ingestion.drivers.fetch_all_pages", return_value=frame):
            DriverIngestor(db).ingest(refresh=refresh)


DRIVER_FRAME = _driver_frame(
    [
        {
            "driverId": "max_verstappen",
            "driverCode": "VER",
            "givenName": "Max",
            "familyName": "Verstappen",
            "dateOfBirth": "1997-09-30",
            "driverNationality": "Dutch",
            "driverUrl": "https://example.com/max",
        }
    ]
)

CONSTRUCTOR_FRAME = _driver_frame(
    [
        {
            "constructorId": "red_bull",
            "constructorName": "Red Bull",
            "constructorNationality": "Austrian",
            "constructorUrl": "https://example.com/rb",
        }
    ]
)


@pytest.fixture()
def stored_driver(db):
    """A driver keyed the way the ingestor keys them: id == the Ergast ref."""
    db.add(
        Driver(
            id="max_verstappen",
            ref="max_verstappen",
            first_name="Max",
            last_name="Verstappen",
            code=None,
            number=1,
        )
    )
    db.commit()


@pytest.fixture()
def stored_constructor(db):
    db.add(
        Constructor(
            id="red_bull",
            ref="red_bull",
            name="Red Bull",
            color="#3671C6",
        )
    )
    db.commit()


class TestDriverIngest:
    def test_ingests_the_code(self, db):
        _run_driver_ingest(db, DRIVER_FRAME)

        assert db.get(Driver, "max_verstappen").code == "VER"

    def test_skips_when_drivers_already_loaded(self, db, stored_driver):
        _run_driver_ingest(db, DRIVER_FRAME)

        assert db.get(Driver, "max_verstappen").code is None

    def test_refresh_backfills_the_code(self, db, stored_driver):
        _run_driver_ingest(db, DRIVER_FRAME, refresh=True)

        assert db.get(Driver, "max_verstappen").code == "VER"

    def test_refresh_preserves_the_number_backfilled_from_results(self, db, stored_driver):
        """`number` is derived in postprocess; a refresh must not merge over it."""
        _run_driver_ingest(db, DRIVER_FRAME, refresh=True)

        assert db.get(Driver, "max_verstappen").number == 1


class TestConstructorIngest:
    def test_refresh_preserves_the_curated_team_colour(self, db, stored_constructor):
        """Colours are curated in the images ingestor, not fetched from Ergast."""
        with patch("src.ingestion.drivers.Ergast", return_value=MagicMock()):
            with patch("src.ingestion.drivers.fetch_all_pages", return_value=CONSTRUCTOR_FRAME):
                ConstructorIngestor(db).ingest(refresh=True)

        stored = db.get(Constructor, "red_bull")
        assert stored.color == "#3671C6"
        assert stored.nationality == "Austrian"
