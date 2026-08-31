"""Ingest weather samples and race control messages from Fast-F1 (2018+ only)."""

import time
from datetime import date

import fastf1
import pandas as pd
from sqlalchemy import select

from src.db.models import Race, RaceControlMessage, RaceWeather, Season
from src.ingestion.base import (
    THROTTLE_DELAY,
    BaseIngestor,
    clean,
    is_interrupted,
    is_rate_limit_error,
    timedelta_to_ms,
)

# Live timing, and therefore both of these feeds, starts in 2018.
FIRST_SUPPORTED_YEAR = 2018


def _float(value) -> float | None:
    value = clean(value)
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int(value) -> int | None:
    value = clean(value)
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _text(value) -> str | None:
    value = clean(value)
    if value is None:
        return None
    text = str(value).strip()
    return text or None


class WeatherIngestor(BaseIngestor):
    """Per-minute weather samples and race control messages for each race.

    Both come from the same Fast-F1 session load, so they are fetched together
    rather than paying the download twice.
    """

    def ingest(self, year_range: tuple[int, int] | None = None) -> None:
        self.log(f"Fetching weather and race control ({FIRST_SUPPORTED_YEAR}+)...")

        existing = set(
            self.db.execute(select(RaceWeather.race_id).group_by(RaceWeather.race_id))
            .scalars()
            .all()
        )

        today = date.today()
        min_year = max(FIRST_SUPPORTED_YEAR, year_range[0]) if year_range else FIRST_SUPPORTED_YEAR
        query = select(Season).where(Season.year >= min_year).order_by(Season.year)
        if year_range:
            query = query.where(Season.year <= year_range[1])
        seasons = self.db.execute(query).scalars().all()

        total_fetched = 0
        total_skipped = 0
        total_samples = 0
        total_messages = 0

        for season in seasons:
            races = (
                self.db.execute(
                    select(Race).where(Race.season_year == season.year).order_by(Race.round)
                )
                .scalars()
                .all()
            )

            race_ids = {r.id for r in races}
            if race_ids and race_ids.issubset(existing):
                total_skipped += len(races)
                continue

            for race in races:
                if is_interrupted():
                    break
                if race.id in existing:
                    total_skipped += 1
                    continue
                if race.date and race.date > today:
                    continue

                try:
                    self.log(f"{season.year} R{race.round}: fetching weather + race control...")
                    load_start = time.time()
                    session = fastf1.get_session(season.year, race.round, "R")
                    session.load(laps=False, telemetry=False, weather=True, messages=True)
                    load_elapsed = time.time() - load_start

                    samples = self._ingest_weather(race, session.weather_data)
                    messages = self._ingest_messages(race, session.race_control_messages)

                    if samples == 0 and messages == 0:
                        self.log(f"{season.year} R{race.round}: no weather or messages available")
                        continue

                    self.db.commit()
                    total_samples += samples
                    total_messages += messages
                    total_fetched += 1
                    self.log(
                        f"{season.year} R{race.round}: {samples} weather samples, "
                        f"{messages} race control messages"
                    )

                    # Throttle only when the load actually hit the network.
                    if load_elapsed > 1.0:
                        remaining = max(0, THROTTLE_DELAY - load_elapsed)
                        if remaining > 0:
                            self.log(f"⏳ Throttle delay ({remaining:.0f}s)...")
                            try:
                                time.sleep(remaining)
                            except KeyboardInterrupt:
                                raise InterruptedError("Seed interrupted by user")

                except InterruptedError:
                    raise
                except KeyboardInterrupt:
                    raise InterruptedError("Seed interrupted by user")
                except Exception as e:
                    self.db.rollback()
                    if is_rate_limit_error(e):
                        self.log(
                            f"{season.year} R{race.round}: rate limited, stopping. "
                            f"Re-run later to continue."
                        )
                        self.log(
                            f"Ingested {total_samples} weather samples and {total_messages} "
                            f"messages from {total_fetched} races before rate limit"
                        )
                        return
                    self.log(f"Weather {season.year} R{race.round}: ERROR - {e}")
                    continue

            if is_interrupted():
                break

        self.log(
            f"Ingested {total_samples} weather samples and {total_messages} race control "
            f"messages from {total_fetched} races ({total_skipped} skipped)"
        )

    def _ingest_weather(self, race: Race, weather: pd.DataFrame | None) -> int:
        if weather is None or weather.empty:
            return 0

        count = 0
        for _, row in weather.iterrows():
            session_time_ms = timedelta_to_ms(row.get("Time"))
            if session_time_ms is None:
                continue

            self.db.merge(
                RaceWeather(
                    id=f"{race.id}_W_{session_time_ms}",
                    race_id=race.id,
                    session_time_ms=session_time_ms,
                    air_temp=_float(row.get("AirTemp")),
                    track_temp=_float(row.get("TrackTemp")),
                    humidity=_float(row.get("Humidity")),
                    pressure=_float(row.get("Pressure")),
                    wind_speed=_float(row.get("WindSpeed")),
                    wind_direction=_int(row.get("WindDirection")),
                    rainfall=bool(clean(row.get("Rainfall")) or False),
                )
            )
            count += 1
        return count

    def _ingest_messages(self, race: Race, messages: pd.DataFrame | None) -> int:
        if messages is None or messages.empty:
            return 0

        count = 0
        for index, row in messages.iterrows():
            text = _text(row.get("Message"))
            if not text:
                continue

            utc = clean(row.get("Time"))
            if utc is not None and not isinstance(utc, pd.Timestamp):
                utc = pd.to_datetime(utc, errors="coerce")
            if utc is not None and pd.isna(utc):
                utc = None

            self.db.merge(
                RaceControlMessage(
                    # Position in the feed keeps the id stable across re-runs;
                    # timestamps repeat within a second.
                    id=f"{race.id}_RC_{index}",
                    race_id=race.id,
                    utc=utc.to_pydatetime() if isinstance(utc, pd.Timestamp) else None,
                    lap=_int(row.get("Lap")),
                    category=_text(row.get("Category")),
                    message=text,
                    flag=_text(row.get("Flag")),
                    scope=_text(row.get("Scope")),
                    sector=_int(row.get("Sector")),
                    driver_number=_text(row.get("RacingNumber")),
                )
            )
            count += 1
        return count
