"""Intra-team head-to-head: how each driver fared against their own teammate.

The teammate comparison is the closest thing F1 has to a controlled experiment —
same car, same season — which is why it is the argument people actually reach
for. This turns a season's results into that table.

Pure functions over flat rows, so the counting rules can be tested directly.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from itertools import combinations


def is_classified(position_text: str | None) -> bool:
    """Whether a result is a finish rather than a retirement.

    Retirements still carry a numeric `position` — it is the order they were
    classified in, not where they finished — so the position column alone
    cannot tell the two apart. Ergast marks the difference in `position_text`:
    a number for a classified finish, a letter otherwise ("R" retired, "W"
    withdrawn, "D" disqualified).
    """
    return bool(position_text) and position_text.isdigit()


@dataclass(frozen=True)
class Entry:
    """One driver's participation in one race, flattened from the result rows."""

    race_id: str
    constructor_id: str
    driver_id: str
    position: int | None
    position_text: str | None
    points: float
    quali_position: int | None

    @property
    def finish_position(self) -> int | None:
        """Finishing position, or None if the driver did not see the flag."""
        return self.position if is_classified(self.position_text) else None


def _compare(a: int | None, b: int | None) -> int | None:
    """Which of two positions is ahead: -1 for a, 1 for b, None if not comparable.

    A round where either driver retired is excluded rather than awarded to
    whoever happened to survive — it says nothing about their relative pace.
    """
    if a is None or b is None:
        return None
    if a == b:
        return None
    return -1 if a < b else 1


def teammate_battles(entries: list[Entry]) -> dict[str, list[dict]]:
    """Per-constructor head-to-head records between drivers who shared a car.

    Returns pairings keyed by constructor, ordered by how many races the pair
    shared — so a full-season pairing outranks a one-off stand-in.
    """
    by_race_team: dict[tuple[str, str], list[Entry]] = defaultdict(list)
    for entry in entries:
        by_race_team[(entry.race_id, entry.constructor_id)].append(entry)

    # (constructor, driver_a, driver_b) -> tallies, with driver ids sorted so a
    # pair is counted once regardless of the order rows arrive in.
    tallies: dict[tuple[str, str, str], dict] = defaultdict(
        lambda: {
            "shared": 0,
            "raceA": 0,
            "raceB": 0,
            "raceCompared": 0,
            "qualiA": 0,
            "qualiB": 0,
            "qualiCompared": 0,
        }
    )
    driver_totals: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"points": 0.0, "races": 0, "bestFinish": None}
    )

    for (_, constructor_id), line_up in by_race_team.items():
        for entry in line_up:
            totals = driver_totals[(constructor_id, entry.driver_id)]
            totals["points"] += entry.points
            totals["races"] += 1
            finish = entry.finish_position
            if finish is not None:
                best = totals["bestFinish"]
                totals["bestFinish"] = finish if best is None else min(best, finish)

        for first, second in combinations(sorted(line_up, key=lambda e: e.driver_id), 2):
            if first.driver_id == second.driver_id:
                continue
            key = (constructor_id, first.driver_id, second.driver_id)
            tally = tallies[key]
            tally["shared"] += 1

            race = _compare(first.finish_position, second.finish_position)
            if race is not None:
                tally["raceCompared"] += 1
                tally["raceA" if race < 0 else "raceB"] += 1

            quali = _compare(first.quali_position, second.quali_position)
            if quali is not None:
                tally["qualiCompared"] += 1
                tally["qualiA" if quali < 0 else "qualiB"] += 1

    battles: dict[str, list[dict]] = defaultdict(list)
    for (constructor_id, driver_a, driver_b), tally in tallies.items():
        totals_a = driver_totals[(constructor_id, driver_a)]
        totals_b = driver_totals[(constructor_id, driver_b)]
        battles[constructor_id].append(
            {
                "driverAId": driver_a,
                "driverBId": driver_b,
                "sharedRaces": tally["shared"],
                "race": {
                    "a": tally["raceA"],
                    "b": tally["raceB"],
                    "compared": tally["raceCompared"],
                },
                "qualifying": {
                    "a": tally["qualiA"],
                    "b": tally["qualiB"],
                    "compared": tally["qualiCompared"],
                },
                "pointsA": round(totals_a["points"], 2),
                "pointsB": round(totals_b["points"], 2),
                "bestFinishA": totals_a["bestFinish"],
                "bestFinishB": totals_b["bestFinish"],
            }
        )

    for pairings in battles.values():
        pairings.sort(key=lambda p: -p["sharedRaces"])

    return dict(battles)
