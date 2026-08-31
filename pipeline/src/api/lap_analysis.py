"""Race-pace analysis derived from stored lap times.

Everything here works off the `lap_times` table, which already carries the
compound, stint number and tyre age Fast-F1 reports — no extra ingestion.

The functions are deliberately pure (they take plain samples, not ORM rows) so
they can be unit-tested without a database and stay portable across the
PostgreSQL app and the SQLite test harness.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from statistics import median

# Compound strings that reached the database as text rather than NULL.
_MISSING_COMPOUNDS = {"", "nan", "none", "null", "unknown"}

# Laps slower than this multiple of the race median are dropped from pace
# analysis: safety cars, virtual safety cars, traffic and damage. 107% mirrors
# the qualifying cutoff and is loose enough to keep genuine slow-compound laps.
CLEAN_LAP_THRESHOLD = 1.07

# A stint must have at least this many representative laps before its
# degradation slope means anything.
MIN_STINT_LAPS_FOR_SLOPE = 4

# A compound needs a real sample before a race-wide degradation rate is worth
# quoting. A handful of laps on an unusual compound produces wild slopes that
# read as fact on a chart.
MIN_COMPOUND_LAPS_FOR_SLOPE = 20

# Cars start heavy and get lighter, worth roughly 0.03s a lap. Without
# correcting for it, tyre degradation is masked — early-race soft stints come
# out *negative*, as if the tyres improved with age. The real figure varies by
# circuit (roughly 0.025-0.04s); 0.03 is the usual working average.
FUEL_EFFECT_MS_PER_LAP = 30


@dataclass(frozen=True)
class LapSample:
    """One timed lap, flattened from a `LapTime` row."""

    driver_id: str
    lap_number: int
    time_ms: int | None
    compound: str | None
    stint: int | None
    tyre_life: int | None


def normalize_compound(value: str | None) -> str | None:
    """Return a clean upper-case compound name, or None when unknown.

    Fast-F1 hands back the strings "nan"/"None"/"UNKNOWN" for laps with no
    recorded compound, and those were stored verbatim.
    """
    if value is None:
        return None
    cleaned = value.strip()
    if cleaned.lower() in _MISSING_COMPOUNDS:
        return None
    return cleaned.upper()


def _stint_edge_laps(laps: list[LapSample]) -> set[tuple[str, int]]:
    """The (driver, lap) pairs that open or close a stint.

    The first lap of a stint is an out-lap and the last is an in-lap; both carry
    pit-lane time and would swamp any pace signal.
    """
    by_stint: dict[tuple[str, int], list[int]] = defaultdict(list)
    for lap in laps:
        if lap.stint is None:
            continue
        by_stint[(lap.driver_id, lap.stint)].append(lap.lap_number)

    edges: set[tuple[str, int]] = set()
    for (driver_id, _), lap_numbers in by_stint.items():
        edges.add((driver_id, min(lap_numbers)))
        edges.add((driver_id, max(lap_numbers)))
    return edges


def representative_laps(
    laps: list[LapSample],
    threshold: float = CLEAN_LAP_THRESHOLD,
) -> list[LapSample]:
    """Laps that reflect green-flag race pace.

    Drops untimed laps, laps with no known compound or tyre age, stint edges
    (out- and in-laps), and anything slower than `threshold` times the median.
    """
    timed = [
        lap
        for lap in laps
        if lap.time_ms
        and lap.time_ms > 0
        and lap.tyre_life is not None
        and normalize_compound(lap.compound) is not None
    ]
    if not timed:
        return []

    edges = _stint_edge_laps(laps)
    on_pace_cutoff = median(lap.time_ms for lap in timed) * threshold

    return [
        lap
        for lap in timed
        if (lap.driver_id, lap.lap_number) not in edges and lap.time_ms <= on_pace_cutoff
    ]


def fuel_corrected_ms(time_ms: int, lap_number: int, total_laps: int) -> int:
    """Lap time normalized to an end-of-race fuel load.

    Removes the advantage a lap gains purely from the fuel already burned, so
    what is left is attributable to the tyre.
    """
    laps_remaining = max(total_laps - lap_number, 0)
    return time_ms - laps_remaining * FUEL_EFFECT_MS_PER_LAP


def _linear_slope(points: list[tuple[float, float]]) -> float | None:
    """Least-squares slope of y over x, or None when x has no spread."""
    if len(points) < 2:
        return None

    n = len(points)
    mean_x = sum(x for x, _ in points) / n
    mean_y = sum(y for _, y in points) / n

    denominator = sum((x - mean_x) ** 2 for x, _ in points)
    if denominator == 0:
        return None

    numerator = sum((x - mean_x) * (y - mean_y) for x, y in points)
    return numerator / denominator


def degradation_by_compound(laps: list[LapSample]) -> list[dict]:
    """Lap time against tyre age, per compound.

    Each entry carries a median-per-age curve for plotting — both as-driven and
    fuel-corrected — plus the degradation rate in milliseconds per lap of tyre
    age. The rate is fitted on fuel-corrected times, since raw times conflate
    tyre wear with the car getting lighter.
    """
    clean = representative_laps(laps)
    total_laps = max((lap.lap_number for lap in laps), default=0)

    grouped: dict[str, list[LapSample]] = defaultdict(list)
    for lap in clean:
        compound = normalize_compound(lap.compound)
        if compound is not None:
            grouped[compound].append(lap)

    out = []
    for compound, compound_laps in grouped.items():
        by_age: dict[int, list[int]] = defaultdict(list)
        corrected_by_age: dict[int, list[int]] = defaultdict(list)
        for lap in compound_laps:
            by_age[lap.tyre_life].append(lap.time_ms)
            corrected_by_age[lap.tyre_life].append(
                fuel_corrected_ms(lap.time_ms, lap.lap_number, total_laps)
            )

        points = [
            {
                "tyreLife": age,
                "medianMs": int(median(times)),
                "fuelCorrectedMedianMs": int(median(corrected_by_age[age])),
                "samples": len(times),
            }
            for age, times in sorted(by_age.items())
        ]

        corrected = [
            (
                float(lap.tyre_life),
                float(fuel_corrected_ms(lap.time_ms, lap.lap_number, total_laps)),
            )
            for lap in compound_laps
        ]
        has_sample = len(compound_laps) >= MIN_COMPOUND_LAPS_FOR_SLOPE
        slope = _linear_slope(corrected) if has_sample else None
        raw_slope = (
            _linear_slope([(float(lap.tyre_life), float(lap.time_ms)) for lap in compound_laps])
            if has_sample
            else None
        )

        out.append(
            {
                "compound": compound,
                "points": points,
                "degradationMsPerLap": round(slope, 1) if slope is not None else None,
                "rawTrendMsPerLap": round(raw_slope, 1) if raw_slope is not None else None,
                "samples": len(compound_laps),
                "fastestMs": min(lap.time_ms for lap in compound_laps),
            }
        )

    # Fastest compound first: that is the order people read a tyre chart in.
    out.sort(key=lambda entry: entry["fastestMs"])
    return out


def stint_summary(laps: list[LapSample]) -> dict[str, list[dict]]:
    """Per-driver stint breakdown: compound, lap range, pace and degradation.

    Pace figures come from representative laps only, but `laps` counts the whole
    stint so the lap range still matches what happened on track.
    """
    clean_keys = {(lap.driver_id, lap.lap_number) for lap in representative_laps(laps)}
    total_laps = max((lap.lap_number for lap in laps), default=0)

    by_stint: dict[tuple[str, int], list[LapSample]] = defaultdict(list)
    for lap in laps:
        if lap.stint is not None:
            by_stint[(lap.driver_id, lap.stint)].append(lap)

    summary: dict[str, list[dict]] = defaultdict(list)
    for (driver_id, stint), stint_laps in sorted(by_stint.items(), key=lambda kv: kv[0]):
        ordered = sorted(stint_laps, key=lambda lap: lap.lap_number)
        paced = [lap for lap in ordered if (lap.driver_id, lap.lap_number) in clean_keys]

        times = [lap.time_ms for lap in paced]
        slope = (
            _linear_slope(
                [
                    (
                        float(lap.tyre_life),
                        float(fuel_corrected_ms(lap.time_ms, lap.lap_number, total_laps)),
                    )
                    for lap in paced
                ]
            )
            if len(paced) >= MIN_STINT_LAPS_FOR_SLOPE
            else None
        )

        summary[driver_id].append(
            {
                "stint": stint,
                "compound": normalize_compound(ordered[0].compound),
                "startLap": ordered[0].lap_number,
                "endLap": ordered[-1].lap_number,
                "laps": len(ordered),
                "medianMs": int(median(times)) if times else None,
                "bestMs": min(times) if times else None,
                "degradationMsPerLap": round(slope, 1) if slope is not None else None,
            }
        )

    return summary


def gaps_to_leader(laps: list[LapSample]) -> tuple[dict[str, list[dict]], int]:
    """Each driver's cumulative gap to the race leader, lap by lap.

    A driver's series runs until they stop appearing in the lap data — a
    retirement. An isolated lap that has a row but no time (a timing dropout)
    is filled with the field's median for that lap rather than ending the
    series: stopping there would throw away the rest of an otherwise complete
    race, and skipping it would silently understate their elapsed time.

    Returns the per-driver series and the highest lap number covered.
    """
    by_driver: dict[str, dict[int, int | None]] = defaultdict(dict)
    for lap in laps:
        by_driver[lap.driver_id][lap.lap_number] = lap.time_ms

    # Field median per lap, used to fill timing dropouts.
    per_lap_times: dict[int, list[int]] = defaultdict(list)
    for lap in laps:
        if lap.time_ms and lap.time_ms > 0:
            per_lap_times[lap.lap_number].append(lap.time_ms)
    lap_median = {number: median(times) for number, times in per_lap_times.items()}

    cumulative: dict[str, dict[int, int]] = {}
    estimated: dict[str, int] = {}
    for driver_id, driver_laps in by_driver.items():
        running = 0
        series: dict[int, int] = {}
        fills = 0
        for lap_number in range(1, max(driver_laps, default=0) + 1):
            if lap_number not in driver_laps:
                # No row at all: the driver is no longer running.
                break
            time_ms = driver_laps[lap_number]
            if not time_ms or time_ms <= 0:
                fallback = lap_median.get(lap_number)
                if fallback is None:
                    break
                time_ms = int(fallback)
                fills += 1
            running += time_ms
            series[lap_number] = running
        if series:
            cumulative[driver_id] = series
            estimated[driver_id] = fills

    total_laps = max((max(series) for series in cumulative.values()), default=0)

    leader_at_lap: dict[int, int] = {}
    for lap_number in range(1, total_laps + 1):
        elapsed = [series[lap_number] for series in cumulative.values() if lap_number in series]
        if elapsed:
            leader_at_lap[lap_number] = min(elapsed)

    gaps: dict[str, list[dict]] = {}
    for driver_id, series in cumulative.items():
        gaps[driver_id] = [
            {"lap": lap_number, "gapMs": series[lap_number] - leader_at_lap[lap_number]}
            for lap_number in sorted(series)
        ]

    return gaps, total_laps
