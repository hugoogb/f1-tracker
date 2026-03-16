from src.db.models import Constructor, Driver


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
