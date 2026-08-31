"""Search coverage for races, seasons, and result ranking.

Search previously matched only drivers, constructors and circuits, so a query
like "Monaco 2019" — the obvious way to look up one specific race — returned
nothing useful.
"""

import datetime

import pytest

from src.db.models import Circuit, Race, Season
from src.db.queries import split_year


class TestSplitYear:
    @pytest.mark.parametrize(
        ("query", "expected"),
        [
            ("monaco 2019", (2019, "monaco")),
            ("2019 monaco", (2019, "monaco")),
            ("monaco", (None, "monaco")),
            ("2019", (2019, "")),
            ("  spa  1998  ", (1998, "spa")),
        ],
    )
    def test_splits_a_standalone_year_from_the_rest(self, query, expected):
        assert split_year(query) == expected

    def test_ignores_years_outside_the_f1_era(self):
        assert split_year("1492 discovery") == (None, "1492 discovery")

    def test_ignores_digits_embedded_in_a_word(self):
        assert split_year("v2019x") == (None, "v2019x")


@pytest.fixture()
def calendar(seed_data, db):
    """Monaco and Silverstone rounds across three seasons."""
    monza = db.get(Circuit, "circuit-1")
    monaco = Circuit(
        id="circuit-monaco",
        ref="monaco",
        name="Circuit de Monaco",
        location="Monte-Carlo",
        country="Monaco",
        country_code="MC",
    )
    db.add(monaco)
    for year in (2019, 2021, 2023):
        # seed_data already created 2023.
        if year != 2023:
            db.add(Season(year=year))
        db.add(
            Race(
                id=f"{year}_06",
                season_year=year,
                round=6,
                name="Monaco Grand Prix",
                circuit_id=monaco.id,
                date=datetime.date(year, 5, 26),
            )
        )
        db.add(
            Race(
                id=f"{year}_14",
                season_year=year,
                round=14,
                name="Italian Grand Prix",
                circuit_id=monza.id,
                date=datetime.date(year, 9, 8),
            )
        )
    db.commit()


class TestRaceSearch:
    def test_circuit_plus_year_finds_the_single_race(self, client, calendar):
        races = client.get("/api/search?q=Monaco 2019").json()["races"]

        assert [(r["seasonYear"], r["name"]) for r in races] == [(2019, "Monaco Grand Prix")]

    def test_race_name_alone_returns_most_recent_first(self, client, calendar):
        races = client.get("/api/search?q=Monaco").json()["races"]

        assert [r["seasonYear"] for r in races] == [2023, 2021, 2019]

    def test_matches_on_circuit_name_not_just_race_name(self, client, calendar):
        """ "Monza" is the circuit; the race is called the Italian Grand Prix."""
        races = client.get("/api/search?q=Monza 2021").json()["races"]

        assert [(r["seasonYear"], r["name"]) for r in races] == [(2021, "Italian Grand Prix")]

    def test_bare_year_does_not_dump_the_whole_calendar(self, client, calendar):
        body = client.get("/api/search?q=2019").json()

        assert body["races"] == []
        assert [s["year"] for s in body["seasons"]] == [2019]

    def test_race_payload_carries_the_circuit(self, client, calendar):
        race = client.get("/api/search?q=Monaco 2019").json()["races"][0]

        assert race["round"] == 6
        assert race["date"] == "2019-05-26"
        assert race["circuit"]["ref"] == "monaco"
        assert race["circuit"]["countryCode"] == "MC"


class TestSeasonSearch:
    def test_exact_year(self, client, calendar):
        assert [s["year"] for s in client.get("/api/search?q=2019").json()["seasons"]] == [2019]

    def test_year_prefix_matches_a_decade_newest_first(self, client, calendar):
        years = [s["year"] for s in client.get("/api/search?q=20").json()["seasons"]]

        assert years == sorted(years, reverse=True)
        assert 2019 in years

    def test_non_numeric_query_returns_no_seasons(self, client, calendar):
        assert client.get("/api/search?q=monaco").json()["seasons"] == []


class TestYearIsStrippedForEntitySearches:
    """A year is noise to drivers, constructors and circuits."""

    def test_circuit_still_found_alongside_a_year(self, client, calendar):
        circuits = client.get("/api/search?q=Monaco 2019").json()["circuits"]

        assert [c["ref"] for c in circuits] == ["monaco"]

    def test_driver_still_found_alongside_a_year(self, client, calendar):
        drivers = client.get("/api/search?q=verstappen 2019").json()["drivers"]

        assert [d["ref"] for d in drivers] == ["max_verstappen"]


class TestRelevanceRanking:
    def test_exact_constructor_name_outranks_a_substring_match(self, client, seed_data, db):
        from src.db.models import Constructor

        db.add(Constructor(id="c-cooper", ref="cooper_bull", name="Cooper-Red Bull"))
        db.commit()

        names = [c["name"] for c in client.get("/api/search?q=Red Bull").json()["constructors"]]

        assert names[0] == "Red Bull"

    def test_driver_code_match_ranks_first(self, client, seed_data, db):
        from src.db.models import Driver

        db.add(Driver(id="d-ver2", ref="verlaine", first_name="Paul", last_name="Verlaine"))
        db.commit()

        refs = [d["ref"] for d in client.get("/api/search?q=VER").json()["drivers"]]

        assert refs[0] == "max_verstappen"
