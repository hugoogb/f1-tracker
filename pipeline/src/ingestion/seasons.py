"""Ingest seasons and circuits from Fast-F1 Ergast API."""

from fastf1.ergast import Ergast
from sqlalchemy import func, select

from src.api.country_codes import country_code
from src.db.models import Circuit, Season
from src.ingestion.base import BaseIngestor, clean, fetch_all_pages


class SeasonIngestor(BaseIngestor):
    def ingest(self) -> None:
        count = self.db.scalar(select(func.count()).select_from(Season))
        if count and count > 0:
            self.log(f"Skipping — {count} seasons already loaded")
            return

        self.log("Fetching seasons...")
        erg = Ergast()
        df = fetch_all_pages(erg.get_seasons)

        count = 0
        for _, row in df.iterrows():
            season = Season(
                year=int(row["season"]),
                url=clean(row.get("seasonUrl")),
            )
            self.db.merge(season)
            count += 1

        self.db.commit()
        self.log(f"Ingested {count} seasons")


class CircuitIngestor(BaseIngestor):
    def ingest(self) -> None:
        count = self.db.scalar(select(func.count()).select_from(Circuit))
        if count and count > 0:
            self.log(f"Skipping — {count} circuits already loaded")
            return

        self.log("Fetching circuits...")
        erg = Ergast()
        df = fetch_all_pages(erg.get_circuits)

        count = 0
        for _, row in df.iterrows():
            lat = clean(row.get("lat"))
            lng = clean(row.get("long"))
            ctry = clean(row.get("country"))
            circuit = Circuit(
                id=row["circuitId"],
                ref=row["circuitId"],
                name=row["circuitName"],
                location=clean(row.get("locality")),
                country=ctry,
                country_code=country_code(ctry),
                latitude=float(lat) if lat is not None else None,
                longitude=float(lng) if lng is not None else None,
                url=clean(row.get("circuitUrl")),
            )
            self.db.merge(circuit)
            count += 1

        self.db.commit()
        self.log(f"Ingested {count} circuits")
