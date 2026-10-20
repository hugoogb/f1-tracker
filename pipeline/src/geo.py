"""Great-circle arithmetic for the season calendar map.

The frontend draws the same arcs from the same formula (`lib/geo.ts`), so the
distance the API reports and the line the map draws can never disagree.
"""

from math import asin, cos, radians, sin, sqrt

# Mean Earth radius (IUGG). The spherical model is within ~0.5% of the
# ellipsoid, which is far below what a "km travelled" figure claims to resolve.
EARTH_RADIUS_KM = 6371.0088


def great_circle_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Haversine distance between two points, in kilometres."""
    phi1, phi2 = radians(lat1), radians(lat2)
    d_phi = phi2 - phi1
    d_lambda = radians(lng2 - lng1)
    h = sin(d_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * asin(min(1.0, sqrt(h)))


def layout_active_in(seasons_active: str, year: int) -> bool:
    """Whether an f1db `seasons_active` string ("1976-1979,1981-1999") covers a year."""
    for part in seasons_active.split(","):
        part = part.strip()
        if not part:
            continue
        start, _, end = part.partition("-")
        try:
            first = int(start)
            last = int(end) if end else first
        except ValueError:
            continue
        if first <= year <= last:
            return True
    return False
