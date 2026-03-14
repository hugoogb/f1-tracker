"""Validate data completeness after ingestion."""

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import func, select  # noqa: E402

from src.db.database import SessionLocal  # noqa: E402
from src.db.models import (  # noqa: E402
    Circuit,
    CircuitLayout,
    Constructor,
    ConstructorStanding,
    Driver,
    DriverStanding,
    PitStop,
    QualifyingResult,
    Race,
    RaceResult,
    Season,
    SprintResult,
    Status,
)

GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
DIM = "\033[2m"
RESET = "\033[0m"


def check_mark(complete: bool) -> str:
    return f"{GREEN}✓{RESET}" if complete else f"{RED}✗{RESET}"


def validate():
    db = SessionLocal()
    has_gaps = False
    today = date.today()

    try:
        print("=== F1 Data Validation ===\n")

        # --- Base entities ---
        counts = {
            "Seasons": db.scalar(select(func.count()).select_from(Season)),
            "Circuits": db.scalar(select(func.count()).select_from(Circuit)),
            "Drivers": db.scalar(select(func.count()).select_from(Driver)),
            "Constructors": db.scalar(select(func.count()).select_from(Constructor)),
            "Statuses": db.scalar(select(func.count()).select_from(Status)),
        }
        print("Base entities:")
        for name, count in counts.items():
            print(f"  {name + ':':<16} {count}")

        # --- Circuit layouts ---
        total_circuits = counts["Circuits"] or 0
        layout_count = db.scalar(select(func.count()).select_from(CircuitLayout))
        circuits_with_layouts = db.scalar(
            select(func.count(CircuitLayout.circuit_id.distinct()))
        )
        layouts_ok = circuits_with_layouts == total_circuits
        print(f"\nCircuit layouts:")
        print(f"  Circuits with layouts: {circuits_with_layouts}/{total_circuits}  {check_mark(layouts_ok)}")
        print(f"  Total layout variants: {layout_count}")
        if not layouts_ok:
            has_gaps = True
            # Find circuits missing layouts
            circuits_missing = db.execute(
                select(Circuit.ref, Circuit.name)
                .where(~Circuit.id.in_(select(CircuitLayout.circuit_id)))
                .order_by(Circuit.name)
            ).all()
            if circuits_missing:
                print(f"  Missing layouts:")
                for ref, name in circuits_missing:
                    print(f"    {ref}: {name}")

        # --- Build race maps ---
        seasons = db.execute(select(Season).order_by(Season.year)).scalars().all()
        all_races = db.execute(select(Race).order_by(Race.season_year, Race.round)).scalars().all()

        races_by_year: dict[int, list[Race]] = {}
        past_races_by_year: dict[int, list[Race]] = {}
        for race in all_races:
            races_by_year.setdefault(race.season_year, []).append(race)
            if race.date is not None and race.date <= today:
                past_races_by_year.setdefault(race.season_year, []).append(race)

        # --- Detect current season ---
        current_year = None
        for s in reversed(seasons):
            all_yr = races_by_year.get(s.year, [])
            past_yr = past_races_by_year.get(s.year, [])
            if past_yr and len(past_yr) < len(all_yr):
                current_year = s.year
                break

        # Preload existing data sets
        races_with_results = set(
            db.execute(select(RaceResult.race_id).group_by(RaceResult.race_id)).scalars().all()
        )
        races_with_quali = set(
            db.execute(
                select(QualifyingResult.race_id).group_by(QualifyingResult.race_id)
            ).scalars().all()
        )
        races_with_pits = set(
            db.execute(select(PitStop.race_id).group_by(PitStop.race_id)).scalars().all()
        )
        races_with_sprints = set(
            db.execute(
                select(SprintResult.race_id).group_by(SprintResult.race_id)
            ).scalars().all()
        )
        ds_races = set(
            db.execute(
                select(DriverStanding.race_id).group_by(DriverStanding.race_id)
            ).scalars().all()
        )
        cs_races = set(
            db.execute(
                select(ConstructorStanding.race_id).group_by(ConstructorStanding.race_id)
            ).scalars().all()
        )

        # --- Current season summary ---
        if current_year:
            all_yr = races_by_year[current_year]
            past_yr = past_races_by_year[current_year]
            completed = len(past_yr)
            remaining = len(all_yr) - completed

            results_ok = sum(1 for r in past_yr if r.id in races_with_results)
            quali_ok = sum(1 for r in past_yr if r.id in races_with_quali)
            pits_ok = sum(1 for r in past_yr if r.id in races_with_pits)
            sprints_count = sum(1 for r in past_yr if r.id in races_with_sprints)

            last_completed = max(past_yr, key=lambda r: r.round)
            has_ds = last_completed.id in ds_races
            has_cs = last_completed.id in cs_races

            print(f"\nCurrent season ({current_year}):")
            print(f"  Progress:    {completed}/{len(all_yr)} races completed ({remaining} remaining)")
            print(f"  Results:     {results_ok}/{completed}  {check_mark(results_ok == completed)}")
            print(f"  Qualifying:  {quali_ok}/{completed}  {check_mark(quali_ok == completed)}")
            print(f"  Standings:   {check_mark(has_ds and has_cs)}")
            print(f"  Pit stops:   {pits_ok}/{completed}  {check_mark(pits_ok == completed)}")
            print(f"  Sprints:     {sprints_count} {DIM}(not all races have sprints){RESET}")

            # Flag current season gaps
            if results_ok < completed or quali_ok < completed or not has_ds or not has_cs:
                has_gaps = True
            if current_year >= 2012 and pits_ok < completed:
                has_gaps = True

        # --- Completed seasons (exclude current) ---
        completed_seasons = [s for s in seasons if s.year != current_year]
        total_completed = len(completed_seasons)

        # Race schedule coverage
        seasons_with_races = sum(1 for s in completed_seasons if races_by_year.get(s.year))
        print(f"\nRace coverage:")
        complete = seasons_with_races == total_completed
        print(f"  Seasons with races: {seasons_with_races}/{total_completed}  {check_mark(complete)}")
        if not complete:
            has_gaps = True
            for s in completed_seasons:
                if not races_by_year.get(s.year):
                    print(f"    {s.year}: 0 races")

        # Race results
        total_past = sum(len(races_by_year.get(s.year, [])) for s in completed_seasons)
        past_with_results = sum(
            1 for s in completed_seasons
            for r in races_by_year.get(s.year, []) if r.id in races_with_results
        )
        complete = past_with_results == total_past
        print(f"\nRace results:")
        print(f"  Races with results: {past_with_results}/{total_past}  {check_mark(complete)}")
        if not complete:
            has_gaps = True
            gaps = _season_gaps(completed_seasons, races_by_year, races_with_results)
            _print_gaps(gaps)

        # Qualifying
        gaps = _season_gaps(completed_seasons, races_by_year, races_with_quali)
        seasons_complete = total_completed - len(gaps)
        complete = seasons_complete == total_completed
        print(f"\nQualifying:")
        print(f"  Complete: {seasons_complete}/{total_completed} seasons  {check_mark(complete)}")
        if not complete:
            has_gaps = True
            _print_gaps(gaps)

        # Sprints (2021+, informational)
        sprint_counts = {}
        for row in db.execute(
            select(Race.season_year, func.count(SprintResult.race_id.distinct()))
            .join(SprintResult, SprintResult.race_id == Race.id, isouter=True)
            .where(Race.season_year >= 2021, Race.season_year != current_year)
            .group_by(Race.season_year)
            .order_by(Race.season_year)
        ).all():
            sprint_counts[row[0]] = row[1]

        if sprint_counts:
            print(f"\nSprints (2021+):")
            for year in sorted(sprint_counts):
                print(f"  {year}: {sprint_counts[year]} sprint races")

        # Standings
        ds_count = 0
        cs_count = 0
        ds_missing = []
        cs_missing = []
        for s in completed_seasons:
            year_races = races_by_year.get(s.year, [])
            if not year_races:
                ds_missing.append(s.year)
                cs_missing.append(s.year)
                continue
            last_race = max(year_races, key=lambda r: r.round)
            if last_race.id in ds_races:
                ds_count += 1
            else:
                ds_missing.append(s.year)
            if last_race.id in cs_races:
                cs_count += 1
            else:
                cs_missing.append(s.year)

        print(f"\nStandings:")
        ds_ok = ds_count == total_completed
        cs_ok = cs_count == total_completed
        print(f"  Driver standings:      {ds_count}/{total_completed}  {check_mark(ds_ok)}")
        print(f"  Constructor standings: {cs_count}/{total_completed}  {check_mark(cs_ok)}")
        if not ds_ok:
            has_gaps = True
            print(f"    Missing driver standings: {', '.join(str(y) for y in ds_missing)}")
        if not cs_ok:
            has_gaps = True
            print(f"    Missing constructor standings: {', '.join(str(y) for y in cs_missing)}")

        # Pit stops (2012+)
        pit_seasons = [s for s in completed_seasons if s.year >= 2012]
        pit_gaps = _season_gaps(pit_seasons, races_by_year, races_with_pits)
        pit_total = len(pit_seasons)
        pit_complete = pit_total - len(pit_gaps)
        pit_ok = pit_complete == pit_total
        print(f"\nPit stops (2012+):")
        print(f"  Complete: {pit_complete}/{pit_total} seasons  {check_mark(pit_ok)}")
        if not pit_ok:
            has_gaps = True
            _print_gaps(pit_gaps)

        print()
        return 0 if not has_gaps else 1

    finally:
        db.close()


def _season_gaps(
    seasons: list,
    races_by_year: dict[int, list],
    existing_race_ids: set[str],
) -> list[tuple[int, int, int]]:
    """Return list of (year, have, total) for incomplete seasons."""
    gaps = []
    for s in seasons:
        year_races = races_by_year.get(s.year, [])
        total = len(year_races)
        if total == 0:
            continue
        have = sum(1 for r in year_races if r.id in existing_race_ids)
        if have < total:
            gaps.append((s.year, have, total))
    return gaps


def _print_gaps(gaps: list[tuple[int, int, int]], label: str = "Gaps") -> None:
    print(f"  {label}:")
    for year, have, total in gaps:
        color = YELLOW if have > 0 else RED
        print(f"    {year}: {color}{have}/{total}{RESET} races")


if __name__ == "__main__":
    sys.exit(validate())
