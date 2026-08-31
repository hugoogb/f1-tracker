from src.db.models import Constructor, Driver, Race, RaceSession


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


# Order of a Grand Prix weekend. Sprint weekends drop the sessions they replace,
# so a kind missing from a race simply does not appear.
SESSION_ORDER = ["FP1", "FP2", "FP3", "SPRINT_QUALIFYING", "SPRINT", "QUALIFYING", "RACE"]

SESSION_LABELS = {
    "FP1": "Practice 1",
    "FP2": "Practice 2",
    "FP3": "Practice 3",
    "SPRINT_QUALIFYING": "Sprint Qualifying",
    "SPRINT": "Sprint",
    "QUALIFYING": "Qualifying",
    "RACE": "Race",
}


def _session_payload(kind: str, date, time) -> dict:
    date_str = str(date) if date else None
    time_str = str(time) if time else None
    return {
        "kind": kind,
        "label": SESSION_LABELS.get(kind, kind),
        "date": date_str,
        "time": time_str,
        "startTime": f"{date_str}T{time_str}Z" if date_str and time_str else None,
    }


def weekend_sessions(race: Race, sessions: list[RaceSession]) -> list[dict]:
    """Every session of a race weekend, the race included, in running order.

    The race is appended from the `Race` row rather than stored twice. Sessions
    are ordered by their actual start where known, since a sprint weekend runs
    them in a different order to a normal one; the canonical order is the
    fallback for rows with no time.
    """
    payload = [_session_payload(s.kind, s.date, s.time) for s in sessions]
    payload.append(_session_payload("RACE", race.date, race.time))

    def sort_key(session: dict):
        canonical = SESSION_ORDER.index(session["kind"]) if session["kind"] in SESSION_ORDER else 99
        return (session["date"] or "9999-99-99", session["time"] or "99:99:99", canonical)

    payload.sort(key=sort_key)
    return payload
