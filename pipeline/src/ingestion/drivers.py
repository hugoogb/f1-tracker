"""Ingest drivers, constructors, and statuses from Fast-F1 Ergast API."""

import pandas as pd
from fastf1.ergast import Ergast
from sqlalchemy import func, select

from src.api.country_codes import country_code
from src.db.models import Constructor, Driver, Status
from src.ingestion.base import BaseIngestor, api_call, clean

PAGE_SIZE = 100


def _fetch_all(method, **kwargs) -> pd.DataFrame:
    """Paginate through an Ergast simple-response endpoint."""
    frames = []
    offset = 0
    while True:
        df = api_call(method, limit=PAGE_SIZE, offset=offset, **kwargs)
        if df.empty:
            break
        frames.append(df)
        if len(df) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


class DriverIngestor(BaseIngestor):
    def ingest(self) -> None:
        count = self.db.scalar(select(func.count()).select_from(Driver))
        if count and count > 0:
            self.log(f"Skipping — {count} drivers already loaded")
            return

        self.log("Fetching drivers...")
        erg = Ergast()
        df = _fetch_all(erg.get_driver_info)

        count = 0
        for _, row in df.iterrows():
            dob = clean(row.get("dateOfBirth"))
            if dob is not None:
                if isinstance(dob, str):
                    dob = pd.to_datetime(dob).date()
                elif hasattr(dob, "date"):
                    dob = dob.date()

            nationality = clean(row.get("driverNationality"))
            driver = Driver(
                id=row["driverId"],
                ref=row["driverId"],
                number=None,
                code=None,
                first_name=row["givenName"],
                last_name=row["familyName"],
                date_of_birth=dob,
                nationality=nationality,
                country_code=country_code(nationality),
                url=clean(row.get("driverUrl")),
            )
            self.db.merge(driver)
            count += 1

        self.db.commit()
        self.log(f"Ingested {count} drivers")


class ConstructorIngestor(BaseIngestor):
    def ingest(self) -> None:
        count = self.db.scalar(select(func.count()).select_from(Constructor))
        if count and count > 0:
            self.log(f"Skipping — {count} constructors already loaded")
            return

        self.log("Fetching constructors...")
        erg = Ergast()
        df = _fetch_all(erg.get_constructor_info)

        count = 0
        for _, row in df.iterrows():
            nationality = clean(row.get("constructorNationality"))
            constructor = Constructor(
                id=row["constructorId"],
                ref=row["constructorId"],
                name=row["constructorName"],
                nationality=nationality,
                country_code=country_code(nationality),
                color=None,
                url=clean(row.get("constructorUrl")),
            )
            self.db.merge(constructor)
            count += 1

        self.db.commit()
        self.log(f"Ingested {count} constructors")


class StatusIngestor(BaseIngestor):
    def ingest(self) -> None:
        count = self.db.scalar(select(func.count()).select_from(Status))
        if count and count > 0:
            self.log(f"Skipping — {count} statuses already loaded")
            return

        self.log("Fetching statuses...")
        erg = Ergast()
        df = _fetch_all(erg.get_finishing_status)

        count = 0
        for _, row in df.iterrows():
            status = Status(
                id=int(row["statusId"]),
                description=row["status"],
            )
            self.db.merge(status)
            count += 1

        self.db.commit()
        self.log(f"Ingested {count} statuses")
