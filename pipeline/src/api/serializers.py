from datetime import datetime

from src.db.models import Constructor, Driver, Race


def _utc_iso(moment: datetime | None) -> str | None:
    """Render a naive-UTC timestamp as an explicit UTC instant for clients.

    Everything in the schedule is stored naive but means UTC, so the marker has
    to be added on the way out — without it a browser reads the string as local
    time and the countdown is off by the viewer's offset.
    """
    return f"{moment.isoformat()}Z" if moment else None


def race_schedule(race: Race) -> dict:
    """The weekend's session start times, UTC, keyed for the frontend.

    Every value is None outside the handful of seasons f1db schedules, which is
    what callers use to decide whether there is a schedule to show at all.
    """
    race_at = _utc_iso(datetime.combine(race.date, race.time)) if race.date and race.time else None
    return {
        "fp1": _utc_iso(race.fp1_at),
        "fp2": _utc_iso(race.fp2_at),
        "fp3": _utc_iso(race.fp3_at),
        "sprintQualifying": _utc_iso(race.sprint_qualifying_at),
        "sprintRace": _utc_iso(race.sprint_race_at),
        "qualifying": _utc_iso(race.qualifying_at),
        "race": race_at,
    }


def driver_summary(driver: Driver) -> dict:
    return {
        "id": driver.id,
        "ref": driver.ref,
        "code": driver.code,
        "firstName": driver.first_name,
        "lastName": driver.last_name,
        "nationality": driver.nationality,
        "countryCode": driver.country_code,
    }


def driver_detail(driver: Driver, **extra) -> dict:
    d = driver_summary(driver)
    d["number"] = driver.number
    d["dateOfBirth"] = str(driver.date_of_birth) if driver.date_of_birth else None
    d.update(extra)
    return d


def constructor_summary(constructor: Constructor) -> dict:
    return {
        "id": constructor.id,
        "ref": constructor.ref,
        "name": constructor.name,
        "nationality": constructor.nationality,
        "countryCode": constructor.country_code,
        "color": constructor.color,
    }


def constructor_detail(constructor: Constructor, **extra) -> dict:
    d = constructor_summary(constructor)
    d.update(extra)
    return d


def constructor_compact(constructor: Constructor) -> dict:
    return {
        "id": constructor.id,
        "ref": constructor.ref,
        "name": constructor.name,
        "color": constructor.color,
    }
