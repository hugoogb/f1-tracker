"""Build end-of-season driver and constructor standings.

Points and finishing positions come from f1db's official standings, which apply
the championship rules of each era — notably the "best N results count" rule
used until 1990, under which Senna took the 1988 title with fewer total points
than Prost. Summing raw race points gets those seasons wrong.

Wins are counted locally from race_results, since f1db's standings omit them.
Seasons f1db has no standings for fall back to the local computation.

Every earlier round gets f1db's official table as it stood after that race as
well — the only source for the running championship under the pre-1991 rules,
where a driver's counted total is not the sum of their results so far. Those
rows are official or absent: a round f1db has no table for is left empty rather
than filled with a sum, so nothing downstream mistakes one for the other.
Consumers that want the final table keep reading the season's last round.
"""

from collections import defaultdict

from sqlalchemy import delete, func, select

from src.db.models import (
    Constructor,
    ConstructorStanding,
    Driver,
    DriverStanding,
    Race,
    RaceResult,
    Season,
    SprintResult,
)
from src.ingestion import f1db
from src.ingestion.base import BaseIngestor
from src.ingestion.races import race_id


class StandingsIngestor(BaseIngestor):
    """Build end-of-season standings from f1db, with locally counted wins."""

    def ingest(self, year_range: tuple[int, int] | None = None) -> None:
        self.log("Building standings...")
        data = f1db.load()
        official = {int(s["year"]): s for s in data.seasons}
        official_rounds = {
            race_id(int(r["year"]), int(r["round"])): r for r in data.races if "year" in r
        }
        applied = 0
        round_tables = 0

        query = select(Season).order_by(Season.year)
        if year_range:
            query = query.where(Season.year >= year_range[0], Season.year <= year_range[1])
        seasons = self.db.execute(query).scalars().all()

        driver_total = 0
        constructor_total = 0

        for season in seasons:
            # Find the last race that has results (not just scheduled)
            last_race = self.db.execute(
                select(Race)
                .where(
                    Race.season_year == season.year,
                    Race.id.in_(select(RaceResult.race_id)),
                )
                .order_by(Race.round.desc())
                .limit(1)
            ).scalar_one_or_none()

            if not last_race:
                continue

            # Always delete and recompute to ensure correctness
            season_race_ids = select(Race.id).where(Race.season_year == season.year)
            self.db.execute(
                delete(DriverStanding).where(DriverStanding.race_id.in_(season_race_ids))
            )
            self.db.execute(
                delete(ConstructorStanding).where(ConstructorStanding.race_id.in_(season_race_ids))
            )

            driver_total += self._compute_driver_standings(season.year, last_race.id)
            constructor_total += self._compute_constructor_standings(season.year, last_race.id)

            if self._apply_official(official.get(season.year), last_race.id):
                applied += 1
            round_tables += self._apply_rounds(season.year, last_race, official_rounds)

        self.log(
            f"Built {driver_total} driver standings, {constructor_total} constructor standings "
            f"({applied} seasons using f1db official points, "
            f"{round_tables} official tables after earlier rounds)"
        )

    def _apply_rounds(self, year: int, last_race: Race, official_rounds: dict[str, dict]) -> int:
        """Write f1db's official table after every round before the season's last.

        The last round is left to `_compute_*` + `_apply_official`, which also
        cover seasons f1db has no standings for. Wins are the races won up to
        and including each round, counted locally as they are for the final
        table. Returns how many rounds got a table.
        """
        raced = (
            self.db.execute(
                select(Race)
                .where(
                    Race.season_year == year,
                    Race.round < last_race.round,
                    Race.id.in_(select(RaceResult.race_id)),
                )
                .order_by(Race.round)
            )
            .scalars()
            .all()
        )
        if not raced:
            return 0

        winners: dict[str, tuple[str, str]] = {}
        for rid, driver_id, constructor_id in self.db.execute(
            select(RaceResult.race_id, RaceResult.driver_id, RaceResult.constructor_id).where(
                RaceResult.race_id.in_([r.id for r in raced]), RaceResult.position == 1
            )
        ).all():
            # Shared drives (1950s) can list two winners; the first one stands.
            winners.setdefault(rid, (driver_id, constructor_id))

        known_drivers = set(self.db.execute(select(Driver.id)).scalars().all())
        known_constructors = set(self.db.execute(select(Constructor.id)).scalars().all())

        wins: dict[str, dict[str, int]] = {"DS": defaultdict(int), "CS": defaultdict(int)}
        written = 0
        for race in raced:
            if race.id in winners:
                driver_id, constructor_id = winners[race.id]
                wins["DS"][driver_id] += 1
                wins["CS"][constructor_id] += 1

            source = official_rounds.get(race.id) or {}
            tables = (
                (source.get("driverStandings") or [], DriverStanding, "driverId", "DS"),
                (
                    source.get("constructorStandings") or [],
                    ConstructorStanding,
                    "constructorId",
                    "CS",
                ),
            )
            wrote_any = False
            for rows, model, key, prefix in tables:
                known = known_drivers if prefix == "DS" else known_constructors
                for row in rows:
                    entity_id = row.get(key)
                    position = row.get("positionNumber")
                    if not entity_id or entity_id not in known:
                        continue
                    fields = {
                        "id": f"{race.id}_{prefix}_{entity_id}",
                        "race_id": race.id,
                        "points": float(row.get("points") or 0),
                        "position": int(position) if position is not None else None,
                        "wins": wins[prefix][entity_id],
                    }
                    fields["driver_id" if prefix == "DS" else "constructor_id"] = entity_id
                    self.db.merge(model(**fields))
                    wrote_any = True
            written += wrote_any

        self.db.commit()
        return written

    def _apply_official(self, season: dict | None, last_race_id: str) -> bool:
        """Overlay f1db's official points and positions onto the computed rows.

        Locally counted wins are preserved. Returns False when f1db carries no
        standings for the season, leaving the computed values in place.
        """
        if not season:
            return False

        driver_rows = season.get("driverStandings") or []
        constructor_rows = season.get("constructorStandings") or []
        if not driver_rows and not constructor_rows:
            return False

        for rows, model, key, prefix in (
            (driver_rows, DriverStanding, "driverId", "DS"),
            (constructor_rows, ConstructorStanding, "constructorId", "CS"),
        ):
            for row in rows:
                entity_id = row.get(key)
                position = row.get("positionNumber")
                if not entity_id or position is None:
                    continue

                standing = self.db.get(model, f"{last_race_id}_{prefix}_{entity_id}")
                if standing is None:
                    continue
                standing.points = float(row.get("points") or 0)
                standing.position = int(position)

        self.db.commit()
        return True

    def _compute_driver_standings(self, year: int, last_race_id: str) -> int:
        """Sum points + count wins from race_results and sprint_results for a season."""
        # Only include races that have results
        race_ids = (
            self.db.execute(
                select(Race.id).where(
                    Race.season_year == year,
                    Race.id.in_(select(RaceResult.race_id)),
                )
            )
            .scalars()
            .all()
        )

        if not race_ids:
            return 0

        # Race points + wins
        race_stats = dict(
            self.db.execute(
                select(
                    RaceResult.driver_id,
                    func.coalesce(func.sum(RaceResult.points), 0).label("pts"),
                )
                .where(RaceResult.race_id.in_(race_ids))
                .group_by(RaceResult.driver_id)
            ).all()
        )

        race_wins: dict[str, int] = {}
        for row in self.db.execute(
            select(
                RaceResult.driver_id,
                func.count().label("w"),
            )
            .where(RaceResult.race_id.in_(race_ids), RaceResult.position == 1)
            .group_by(RaceResult.driver_id)
        ).all():
            race_wins[row[0]] = row[1]

        # Sprint points (2021+)
        sprint_pts: dict[str, float] = {}
        if year >= 2021:
            for row in self.db.execute(
                select(
                    SprintResult.driver_id,
                    func.coalesce(func.sum(SprintResult.points), 0).label("pts"),
                )
                .where(SprintResult.race_id.in_(race_ids))
                .group_by(SprintResult.driver_id)
            ).all():
                sprint_pts[row[0]] = float(row[1])

        # Merge and rank
        all_drivers = set(race_stats.keys()) | set(sprint_pts.keys())
        standings = []
        for driver_id in all_drivers:
            total_pts = float(race_stats.get(driver_id, 0)) + sprint_pts.get(driver_id, 0)
            wins = race_wins.get(driver_id, 0)
            standings.append((driver_id, total_pts, wins))

        # Sort by points desc, then wins desc
        standings.sort(key=lambda x: (x[1], x[2]), reverse=True)

        for pos, (driver_id, pts, wins) in enumerate(standings, 1):
            standing = DriverStanding(
                id=f"{last_race_id}_DS_{driver_id}",
                race_id=last_race_id,
                driver_id=driver_id,
                points=pts,
                position=pos,
                wins=wins,
            )
            self.db.merge(standing)

        self.db.commit()
        return len(standings)

    def _compute_constructor_standings(self, year: int, last_race_id: str) -> int:
        """Sum points + count wins from race_results and sprint_results for a season."""
        # Only include races that have results
        race_ids = (
            self.db.execute(
                select(Race.id).where(
                    Race.season_year == year,
                    Race.id.in_(select(RaceResult.race_id)),
                )
            )
            .scalars()
            .all()
        )

        if not race_ids:
            return 0

        # Race points + wins
        race_stats = dict(
            self.db.execute(
                select(
                    RaceResult.constructor_id,
                    func.coalesce(func.sum(RaceResult.points), 0).label("pts"),
                )
                .where(RaceResult.race_id.in_(race_ids))
                .group_by(RaceResult.constructor_id)
            ).all()
        )

        race_wins: dict[str, int] = {}
        for row in self.db.execute(
            select(
                RaceResult.constructor_id,
                func.count().label("w"),
            )
            .where(RaceResult.race_id.in_(race_ids), RaceResult.position == 1)
            .group_by(RaceResult.constructor_id)
        ).all():
            race_wins[row[0]] = row[1]

        # Sprint points (2021+)
        sprint_pts: dict[str, float] = {}
        if year >= 2021:
            for row in self.db.execute(
                select(
                    SprintResult.constructor_id,
                    func.coalesce(func.sum(SprintResult.points), 0).label("pts"),
                )
                .where(SprintResult.race_id.in_(race_ids))
                .group_by(SprintResult.constructor_id)
            ).all():
                sprint_pts[row[0]] = float(row[1])

        # Merge and rank
        all_constructors = set(race_stats.keys()) | set(sprint_pts.keys())
        standings = []
        for cid in all_constructors:
            total_pts = float(race_stats.get(cid, 0)) + sprint_pts.get(cid, 0)
            wins = race_wins.get(cid, 0)
            standings.append((cid, total_pts, wins))

        standings.sort(key=lambda x: (x[1], x[2]), reverse=True)

        for pos, (cid, pts, wins) in enumerate(standings, 1):
            standing = ConstructorStanding(
                id=f"{last_race_id}_CS_{cid}",
                race_id=last_race_id,
                constructor_id=cid,
                points=pts,
                position=pos,
                wins=wins,
            )
            self.db.merge(standing)

        self.db.commit()
        return len(standings)
