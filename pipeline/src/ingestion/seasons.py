"""Ingest seasons and circuits from the f1db dataset."""

from sqlalchemy import select

from src.db.models import Circuit, CircuitLayout, Season
from src.ingestion import f1db
from src.ingestion.base import BaseIngestor


class SeasonIngestor(BaseIngestor):
    def ingest(self) -> None:
        data = f1db.load()
        self.log(f"Ingesting {len(data.seasons)} seasons...")

        for season in data.seasons:
            self.db.merge(Season(year=int(season["year"])))

        self.db.commit()
        self.log(f"Ingested {len(data.seasons)} seasons")


class CircuitIngestor(BaseIngestor):
    def ingest(self) -> None:
        data = f1db.load()
        self.log(f"Ingesting {len(data.circuits)} circuits...")

        for circuit in data.circuits:
            country_id = circuit.get("countryId")
            self.db.merge(
                Circuit(
                    id=circuit["id"],
                    ref=circuit["id"],
                    name=circuit.get("fullName") or circuit["name"],
                    location=circuit.get("placeName"),
                    country=data.country_name(country_id),
                    country_code=data.alpha2(country_id),
                    latitude=circuit.get("latitude"),
                    longitude=circuit.get("longitude"),
                )
            )

        self.db.commit()
        self.log(f"Ingested {len(data.circuits)} circuits")


class CircuitLayoutIngestor(BaseIngestor):
    """Ingest circuit layouts, deriving the seasons each was raced on.

    f1db lists a circuit's layouts and tags every race with its
    `circuitLayoutId`, so the active seasons are derived from the schedule
    rather than maintained by hand.
    """

    def ingest(self) -> None:
        data = f1db.load()

        # layout id -> set of years it was actually raced on
        years_by_layout: dict[str, set[int]] = {}
        for race in data.races:
            layout_id = race.get("circuitLayoutId")
            if layout_id:
                years_by_layout.setdefault(layout_id, set()).add(int(race["year"]))

        circuit_ids = {c.ref for c in self.db.execute(select(Circuit)).scalars()}

        rows = 0
        skipped = 0
        for circuit in data.circuits:
            if circuit["id"] not in circuit_ids:
                skipped += 1
                continue
            for number, layout in enumerate(circuit.get("layouts") or [], start=1):
                layout_id = layout["id"]
                self.db.merge(
                    CircuitLayout(
                        id=layout_id,
                        circuit_id=circuit["id"],
                        layout_number=number,
                        svg_id=layout_id,
                        seasons_active=_format_years(years_by_layout.get(layout_id, set())),
                    )
                )
                rows += 1

        self.db.commit()
        msg = f"Ingested {rows} circuit layouts"
        if skipped:
            msg += f" ({skipped} circuits not in DB)"
        self.log(msg)


def _format_years(years: set[int]) -> str:
    """Collapse a set of years into a compact range string: {1950,1951,1953} -> '1950-1951,1953'."""
    if not years:
        return ""
    ordered = sorted(years)
    spans: list[tuple[int, int]] = []
    start = prev = ordered[0]
    for year in ordered[1:]:
        if year == prev + 1:
            prev = year
            continue
        spans.append((start, prev))
        start = prev = year
    spans.append((start, prev))
    return ",".join(str(lo) if lo == hi else f"{lo}-{hi}" for lo, hi in spans)
