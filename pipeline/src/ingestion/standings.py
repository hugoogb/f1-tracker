"""Compute end-of-season driver and constructor standings from race results."""

from sqlalchemy import func, select

from src.db.models import (
    ConstructorStanding,
    DriverStanding,
    Race,
    RaceResult,
    Season,
    SprintResult,
)
from src.ingestion.base import BaseIngestor


class StandingsIngestor(BaseIngestor):
    """Compute end-of-season standings from race_results + sprint_results."""

    def ingest(self) -> None:
        self.log("Computing standings from race results...")

        # Find races that already have standings — skip them
        ds_existing = set(
            self.db.execute(select(DriverStanding.race_id).group_by(DriverStanding.race_id))
            .scalars()
            .all()
        )
        cs_existing = set(
            self.db.execute(
                select(ConstructorStanding.race_id).group_by(ConstructorStanding.race_id)
            )
            .scalars()
            .all()
        )

        seasons = self.db.execute(select(Season).order_by(Season.year)).scalars().all()

        driver_total = 0
        constructor_total = 0

        for season in seasons:
            last_race = self.db.execute(
                select(Race)
                .where(Race.season_year == season.year)
                .order_by(Race.round.desc())
                .limit(1)
            ).scalar_one_or_none()

            if not last_race:
                continue

            # Driver standings
            if last_race.id not in ds_existing:
                count = self._compute_driver_standings(season.year, last_race.id)
                driver_total += count

            # Constructor standings
            if last_race.id not in cs_existing:
                count = self._compute_constructor_standings(season.year, last_race.id)
                constructor_total += count

        self.log(
            f"Computed {driver_total} driver standings, {constructor_total} constructor standings"
        )

    def _compute_driver_standings(self, year: int, last_race_id: str) -> int:
        """Sum points + count wins from race_results and sprint_results for a season."""
        race_ids = self.db.execute(
            select(Race.id).where(Race.season_year == year)
        ).scalars().all()

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
        race_ids = self.db.execute(
            select(Race.id).where(Race.season_year == year)
        ).scalars().all()

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
