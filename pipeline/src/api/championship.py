"""Championship permutations: who can still mathematically win the title.

The question is "is it still possible", so every bound here is deliberately
generous. A contender is counted out only when even a perfect run of remaining
rounds, against a leader who scores nothing, leaves them short. Erring the other
way — telling someone they are eliminated when they are not — is the failure
that actually matters.
"""

from __future__ import annotations

from dataclasses import dataclass

# The fastest-lap bonus point ran from 2019 until it was dropped after 2024.
FASTEST_LAP_POINT_YEARS = range(2019, 2025)

# Used only when a season has no completed race to measure, in which case every
# round is still to come and nobody is eliminated anyway.
FALLBACK_POINTS_FOR_WIN = 25


@dataclass(frozen=True)
class Competitor:
    """A driver or constructor as it stands in the championship."""

    key: str
    position: int | None
    points: float


@dataclass(frozen=True)
class RoundMath:
    """How much is still on the table, and where the numbers came from."""

    rounds_remaining: int
    points_for_win: float
    sprint_points_for_win: float
    fastest_lap_bonus: float

    @property
    def max_points_per_round(self) -> float:
        return self.points_for_win + self.sprint_points_for_win + self.fastest_lap_bonus

    @property
    def max_points_remaining(self) -> float:
        return self.rounds_remaining * self.max_points_per_round


def round_math(
    year: int,
    rounds_remaining: int,
    best_race_score: float | None,
    best_sprint_score: float | None,
) -> RoundMath:
    """Work out the most anyone can still score.

    `best_race_score` and `best_sprint_score` are the highest single-round
    scores actually seen this season, which sidesteps hardcoding six decades of
    points systems. A season's own results are the most reliable statement of
    what winning is worth in it.

    Sprint points are included for *every* remaining round. Which future rounds
    carry a sprint is not in the data, and assuming they all might is the
    assumption that cannot eliminate someone by mistake.
    """
    return RoundMath(
        rounds_remaining=max(rounds_remaining, 0),
        points_for_win=best_race_score if best_race_score else FALLBACK_POINTS_FOR_WIN,
        sprint_points_for_win=best_sprint_score or 0,
        # The observed best may already include this, so it can double-count by
        # a point. That is the safe direction.
        fastest_lap_bonus=1 if year in FASTEST_LAP_POINT_YEARS else 0,
    )


def title_scenarios(competitors: list[Competitor], math: RoundMath) -> dict:
    """Who is still in contention, and by how much.

    `canWin` asks whether a competitor could finish level with or ahead of the
    current leader. Level counts: a tie is resolved on countback, not arithmetic,
    so it is not an elimination.
    """
    if not competitors:
        return {"decided": False, "leader": None, "contenders": []}

    ranked = sorted(competitors, key=lambda c: (-c.points, c.position or 999))
    leader = ranked[0]

    contenders = []
    for competitor in ranked:
        max_attainable = competitor.points + math.max_points_remaining
        is_leader = competitor.key == leader.key
        contenders.append(
            {
                "key": competitor.key,
                "position": competitor.position,
                "points": competitor.points,
                "maxAttainable": max_attainable,
                "gapToLeader": round(leader.points - competitor.points, 2),
                # The leader is always in contention, including once it is over.
                "canWin": is_leader or max_attainable >= leader.points,
                "isLeader": is_leader,
                "pointsNeeded": (
                    0 if is_leader else max(round(leader.points - max_attainable, 2), 0)
                ),
            }
        )

    still_alive = [c for c in contenders if c["canWin"]]

    return {
        # Decided when the leader is mathematically uncatchable — which the
        # final round settles, but a dominant season can settle much earlier.
        "decided": len(still_alive) == 1,
        "leader": leader.key,
        "contenders": contenders,
    }
