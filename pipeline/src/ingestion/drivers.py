"""Ingest drivers, constructors, and retirement statuses from the f1db dataset."""

from datetime import date

from src.db.models import Constructor, Driver, Status
from src.ingestion import f1db
from src.ingestion.base import BaseIngestor


def _parse_date(value) -> date | None:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None


class DriverIngestor(BaseIngestor):
    def ingest(self) -> None:
        data = f1db.load()
        self.log(f"Ingesting {len(data.drivers)} drivers...")

        for driver in data.drivers:
            nationality_id = driver.get("nationalityCountryId")
            self.db.merge(
                Driver(
                    id=driver["id"],
                    ref=driver["id"],
                    number=driver.get("permanentNumber"),
                    code=driver.get("abbreviation"),
                    first_name=driver.get("firstName") or "",
                    last_name=driver.get("lastName") or "",
                    date_of_birth=_parse_date(driver.get("dateOfBirth")),
                    nationality=data.nationality(nationality_id),
                    country_code=data.alpha2(nationality_id),
                )
            )

        self.db.commit()
        self.log(f"Ingested {len(data.drivers)} drivers")


class ConstructorIngestor(BaseIngestor):
    def ingest(self) -> None:
        data = f1db.load()
        self.log(f"Ingesting {len(data.constructors)} constructors...")

        for constructor in data.constructors:
            country_id = constructor.get("countryId")
            self.db.merge(
                Constructor(
                    id=constructor["id"],
                    ref=constructor["id"],
                    name=constructor.get("name") or constructor["id"],
                    nationality=data.nationality(country_id),
                    country_code=data.alpha2(country_id),
                )
            )

        self.db.commit()
        self.log(f"Ingested {len(data.constructors)} constructors")


class StatusIngestor(BaseIngestor):
    """Build the statuses table from f1db's `reasonRetired` vocabulary.

    f1db records retirements as free text on each result rather than as a
    normalised table. We collect the distinct values so `race_results.status_id`
    keeps its foreign key and the API keeps returning a status string.
    """

    FINISHED = "Finished"

    def ingest(self) -> None:
        data = f1db.load()

        reasons: set[str] = set()
        for race in data.races:
            for result in race.get("raceResults") or []:
                reason = result.get("reasonRetired")
                if reason:
                    reasons.add(reason.strip())

        # id 1 is reserved for a classified finish (f1db leaves reasonRetired null).
        ordered = [self.FINISHED, *sorted(reasons)]
        for status_id, description in enumerate(ordered, start=1):
            self.db.merge(Status(id=status_id, description=description))

        self.db.commit()
        self.log(f"Ingested {len(ordered)} statuses ({len(reasons)} retirement reasons)")
