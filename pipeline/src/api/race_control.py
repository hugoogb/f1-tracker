"""Turn race control messages into something a chart can draw.

Race control sends free text ("SAFETY CAR DEPLOYED", "VIRTUAL SAFETY CAR
ENDING"). What the lap charts need instead are *spans*: the lap on which a
period started and the lap it ended. That conversion is the whole job here.

Kept pure so it can be tested against real message wording without a database
or a network round-trip.
"""

from __future__ import annotations

from dataclasses import dataclass

SAFETY_CAR = "SAFETY_CAR"
VIRTUAL_SAFETY_CAR = "VIRTUAL_SAFETY_CAR"
RED_FLAG = "RED_FLAG"

# Matched against the upper-cased message. Order matters: "VIRTUAL SAFETY CAR"
# must be tested before "SAFETY CAR", or every VSC reads as a full safety car.
_DEPLOY_PATTERNS: list[tuple[str, tuple[str, ...]]] = [
    (VIRTUAL_SAFETY_CAR, ("VIRTUAL SAFETY CAR DEPLOYED", "VSC DEPLOYED")),
    (SAFETY_CAR, ("SAFETY CAR DEPLOYED",)),
]

_END_PATTERNS: list[tuple[str, tuple[str, ...]]] = [
    (
        VIRTUAL_SAFETY_CAR,
        ("VIRTUAL SAFETY CAR ENDING", "VSC ENDING", "VIRTUAL SAFETY CAR IN THIS LAP"),
    ),
    (SAFETY_CAR, ("SAFETY CAR IN THIS LAP",)),
]


@dataclass(frozen=True)
class ControlMessage:
    """One race control notification, flattened from a stored row."""

    lap: int | None
    category: str | None
    message: str
    flag: str | None = None
    scope: str | None = None


def _classify(message: str, patterns: list[tuple[str, tuple[str, ...]]]) -> str | None:
    upper = message.upper()
    for kind, needles in patterns:
        if any(needle in upper for needle in needles):
            return kind
    return None


def safety_car_periods(messages: list[ControlMessage], total_laps: int) -> list[dict]:
    """Lap spans during which a safety car, VSC or red flag was in force.

    A period that never gets an explicit end message — the race finishing under
    a safety car, or a red flag that ends the session — runs to `total_laps`.
    Messages without a lap number cannot be placed on a lap axis and are skipped.
    """
    open_periods: dict[str, dict] = {}
    periods: list[dict] = []

    for msg in sorted(
        (m for m in messages if m.lap is not None),
        key=lambda m: m.lap,
    ):
        if msg.flag and msg.flag.upper() == "RED":
            open_periods.setdefault(
                RED_FLAG, {"kind": RED_FLAG, "startLap": msg.lap, "endLap": None}
            )
            continue
        if msg.flag and msg.flag.upper() in {"GREEN", "CLEAR"} and RED_FLAG in open_periods:
            period = open_periods.pop(RED_FLAG)
            period["endLap"] = msg.lap
            periods.append(period)
            continue

        ended = _classify(msg.message, _END_PATTERNS)
        if ended and ended in open_periods:
            period = open_periods.pop(ended)
            period["endLap"] = msg.lap
            periods.append(period)
            continue

        deployed = _classify(msg.message, _DEPLOY_PATTERNS)
        # An end message also contains "SAFETY CAR", so only treat a message as a
        # deployment when it is not an end.
        if deployed and not ended and deployed not in open_periods:
            open_periods[deployed] = {"kind": deployed, "startLap": msg.lap, "endLap": None}

    # Anything still open ran to the end of the race.
    for period in open_periods.values():
        period["endLap"] = total_laps or period["startLap"]
        periods.append(period)

    periods.sort(key=lambda p: (p["startLap"], p["kind"]))
    return periods


def weather_summary(samples: list[dict]) -> dict | None:
    """Headline conditions for a race, from its per-minute weather samples."""
    if not samples:
        return None

    def stat(key: str, fn):
        values = [s[key] for s in samples if s.get(key) is not None]
        return round(fn(values), 1) if values else None

    wet_samples = sum(1 for s in samples if s.get("rainfall"))

    return {
        "airTempMin": stat("airTemp", min),
        "airTempMax": stat("airTemp", max),
        "trackTempMin": stat("trackTemp", min),
        "trackTempMax": stat("trackTemp", max),
        "humidityAvg": stat("humidity", lambda v: sum(v) / len(v)),
        "windSpeedMax": stat("windSpeed", max),
        "rainfall": wet_samples > 0,
        # Share of the session that saw rain, which is what "wet race" means to
        # a reader far better than a yes/no.
        "wetShare": round(wet_samples / len(samples), 3),
        "samples": len(samples),
    }
