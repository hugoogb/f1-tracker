"""Formula 1 points systems, 1950 to the present.

Two features need to know what a finishing position is worth: the title
permutations (how many points are still on the table this season) and the
cross-era normalisation (what 1988 looks like scored under today's rules). Both
read from here so they cannot disagree about, say, whether a fastest lap is
worth anything.

This module never touches the standings the site actually publishes. Those come
from f1db's official points via `StandingsIngestor._apply_official`, and they
have to: under the "best N results" rules in force until 1990 a driver's
championship total is not the sum of their races, so re-deriving it would crown
the wrong champion in those seasons. What follows is for answering hypothetical
questions, and is labelled as such everywhere it surfaces.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class PointsSystem:
    """One era's scoring rules.

    `race_points` is the award for 1st, 2nd, 3rd... and runs out where the
    points did. `fastest_lap_point` is worth a point only to a driver finishing
    inside `fastest_lap_within` — in 1950-59 there was no such restriction, and
    the field is 0 there to say so.
    """

    id: str
    label: str
    era: str
    race_points: tuple[float, ...]
    sprint_points: tuple[float, ...] = ()
    fastest_lap_point: bool = False
    fastest_lap_within: int = 0
    notes: str = ""

    def points_for(self, position: int | None) -> float:
        """What a finishing position pays. Outside the points, nothing."""
        if position is None or position < 1 or position > len(self.race_points):
            return 0.0
        return self.race_points[position - 1]

    def sprint_points_for(self, position: int | None) -> float:
        if position is None or position < 1 or position > len(self.sprint_points):
            return 0.0
        return self.sprint_points[position - 1]

    @property
    def win_points(self) -> float:
        return self.race_points[0]

    @property
    def sprint_win_points(self) -> float:
        return self.sprint_points[0] if self.sprint_points else 0.0

    @property
    def max_per_round(self) -> float:
        """The most one driver can take from a race weekend without a sprint."""
        return self.win_points + (1.0 if self.fastest_lap_point else 0.0)


# The sprint has its own history, and it is not tied to the race-points era:
# 2021 paid only the top three, 2022 widened it to eight.
_SPRINT_2021 = (3.0, 2.0, 1.0)
_SPRINT_2022 = (8.0, 7.0, 6.0, 5.0, 4.0, 3.0, 2.0, 1.0)

_MODERN = (25.0, 18.0, 15.0, 12.0, 10.0, 8.0, 6.0, 4.0, 2.0, 1.0)

# Keyed by id, ordered oldest first — the order the UI offers them in.
SYSTEMS: dict[str, PointsSystem] = {
    s.id: s
    for s in (
        PointsSystem(
            id="1950",
            label="8-6-4-3-2",
            era="1950-1959",
            race_points=(8.0, 6.0, 4.0, 3.0, 2.0),
            fastest_lap_point=True,
            notes=(
                "Top five score, and the fastest lap is worth a point to whoever "
                "sets it. Points for shared drives were split between the drivers, "
                "which this does not model."
            ),
        ),
        PointsSystem(
            id="1960",
            label="8-6-4-3-2-1",
            era="1960",
            race_points=(8.0, 6.0, 4.0, 3.0, 2.0, 1.0),
            notes="Sixth place scores for the first time, and the fastest lap stops paying.",
        ),
        PointsSystem(
            id="1961",
            label="9-6-4-3-2-1",
            era="1961-1990",
            race_points=(9.0, 6.0, 4.0, 3.0, 2.0, 1.0),
            notes="The longest-lived system in the sport's history.",
        ),
        PointsSystem(
            id="1991",
            label="10-6-4-3-2-1",
            era="1991-2002",
            race_points=(10.0, 6.0, 4.0, 3.0, 2.0, 1.0),
            notes="A win is worth ten, and every result counts towards the title.",
        ),
        PointsSystem(
            id="2003",
            label="10-8-6-5-4-3-2-1",
            era="2003-2009",
            race_points=(10.0, 8.0, 6.0, 5.0, 4.0, 3.0, 2.0, 1.0),
            notes="Points down to eighth, and a win worth only two more than second.",
        ),
        PointsSystem(
            id="2010",
            label="25-18-15-12-10-8-6-4-2-1",
            era="2010-2018",
            race_points=_MODERN,
            notes="Points down to tenth, on the scale still used today.",
        ),
        PointsSystem(
            id="2019",
            label="25-18-15-... + fastest lap",
            era="2019-2024",
            race_points=_MODERN,
            sprint_points=_SPRINT_2022,
            fastest_lap_point=True,
            fastest_lap_within=10,
            notes="A bonus point for the fastest lap, but only inside the top ten.",
        ),
        PointsSystem(
            id="2025",
            label="25-18-15-12-10-8-6-4-2-1",
            era="2025-",
            race_points=_MODERN,
            sprint_points=_SPRINT_2022,
            notes="The fastest-lap point is dropped again; sprints pay the top eight.",
        ),
    )
}

# Which system a season actually raced under. Ranges are inclusive; the last
# entry is open-ended.
_ERAS: tuple[tuple[int, int | None, str], ...] = (
    (1950, 1959, "1950"),
    (1960, 1960, "1960"),
    (1961, 1990, "1961"),
    (1991, 2002, "1991"),
    (2003, 2009, "2003"),
    (2010, 2018, "2010"),
    (2019, 2024, "2019"),
    (2025, None, "2025"),
)


# The last season in which only part of a driver's record counted towards the
# championship. From 1950 to 1990 some form of "best N results" rule was in
# force — the exact N, and whether the season was split into halves scored
# separately, changed almost every year and is not in the f1db dataset. From
# 1991 every result counts.
#
# So the rule is stated at era level, and the specifics are read back off the
# data instead: a driver whose championship total is lower than the points they
# actually scored dropped the difference, which is a fact the results already
# carry. See `dropped_points` in the seasons router.
LAST_DROPPED_SCORES_SEASON = 1990


def counts_every_result(year: int) -> bool:
    """True when a season's championship is simply the sum of its races."""
    return year > LAST_DROPPED_SCORES_SEASON


def system_for_year(year: int) -> PointsSystem:
    """The points system a season was actually scored under."""
    for start, end, system_id in _ERAS:
        if year >= start and (end is None or year <= end):
            return SYSTEMS[system_id]
    # Only reachable for a year before the championship existed; the earliest
    # system is the closest honest answer.
    return SYSTEMS["1950"]


def sprint_system_for_year(year: int) -> tuple[float, ...]:
    """Sprint points for a season, independent of the race-points era.

    Empty before 2021, when there were no sprints to score.
    """
    if year < 2021:
        return ()
    if year == 2021:
        return _SPRINT_2021
    return _SPRINT_2022


@dataclass
class SeasonEntrant:
    """One competitor's re-scored season, built up race by race."""

    points: float = 0.0
    wins: int = 0
    podiums: int = 0
    per_round: dict[int, float] = field(default_factory=dict)
