from src.db.models import Constructor, Driver, Race


def race_timing(race: Race) -> dict:
    """Date, UTC time-of-day, and the combined ISO-8601 UTC start instant.

    Ergast publishes session times in UTC, so ``startTime`` is safe for the
    frontend to render in the viewer's local timezone. It is ``None`` for
    races with no known time (most of the pre-2005 archive).
    """
    date = str(race.date) if race.date else None
    time = str(race.time) if race.time else None
    return {
        "date": date,
        "time": time,
        "startTime": f"{date}T{time}Z" if date and time else None,
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
        "headshotUrl": f"/headshots/{driver.ref}.png" if driver.has_headshot else None,
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
    d["logoUrl"] = f"/logos/{constructor.ref}.png" if constructor.has_logo else None
    d.update(extra)
    return d


def constructor_compact(constructor: Constructor) -> dict:
    return {
        "id": constructor.id,
        "ref": constructor.ref,
        "name": constructor.name,
        "color": constructor.color,
    }
