"""The era / year-range filter shared by the records explorer and best seasons."""

from fastapi import HTTPException

from src.scoring import SYSTEMS, PointsSystem, era_bounds


def resolve_era(
    era: str | None, year_from: int | None, year_to: int | None
) -> tuple[PointsSystem | None, int | None, int | None]:
    """Validate the filter and turn an era into its year range.

    An era is a shorthand for its points system's seasons, so it never comes
    with a range of its own.
    """
    system = None
    if era is not None:
        if year_from is not None or year_to is not None:
            raise HTTPException(
                status_code=400,
                detail="Pass either era or a year_from/year_to range, not both.",
            )
        system = SYSTEMS.get(era)
        if system is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown era '{era}'. The ids come from /api/points-systems.",
            )
        year_from, year_to = era_bounds(system.id)
    if year_from is not None and year_to is not None and year_from > year_to:
        raise HTTPException(status_code=400, detail="year_from must not be later than year_to.")
    return system, year_from, year_to


def era_payload(system: PointsSystem | None) -> dict | None:
    if system is None:
        return None
    return {"id": system.id, "label": system.label, "era": system.era}
