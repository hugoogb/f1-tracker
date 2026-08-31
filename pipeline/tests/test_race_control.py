"""Turning race control messages into chartable spans.

Message wording here is taken from what race control actually sends, since the
parsing is entirely driven by those strings.
"""

import pytest

from src.api.race_control import (
    RED_FLAG,
    SAFETY_CAR,
    VIRTUAL_SAFETY_CAR,
    ControlMessage,
    safety_car_periods,
    weather_summary,
)


def msg(lap, message, flag=None, category="Other", scope=None):
    return ControlMessage(lap=lap, category=category, message=message, flag=flag, scope=scope)


class TestSafetyCarPeriods:
    def test_pairs_a_deployment_with_its_end(self):
        periods = safety_car_periods(
            [
                msg(12, "SAFETY CAR DEPLOYED"),
                msg(16, "SAFETY CAR IN THIS LAP"),
            ],
            total_laps=57,
        )

        assert periods == [{"kind": SAFETY_CAR, "startLap": 12, "endLap": 16}]

    def test_virtual_safety_car_is_not_read_as_a_full_safety_car(self):
        """ "VIRTUAL SAFETY CAR" contains "SAFETY CAR", so order of matching matters."""
        periods = safety_car_periods(
            [
                msg(30, "VIRTUAL SAFETY CAR DEPLOYED"),
                msg(32, "VIRTUAL SAFETY CAR ENDING"),
            ],
            total_laps=57,
        )

        assert [p["kind"] for p in periods] == [VIRTUAL_SAFETY_CAR]

    def test_handles_both_kinds_in_one_race(self):
        periods = safety_car_periods(
            [
                msg(5, "VIRTUAL SAFETY CAR DEPLOYED"),
                msg(7, "VIRTUAL SAFETY CAR ENDING"),
                msg(40, "SAFETY CAR DEPLOYED"),
                msg(44, "SAFETY CAR IN THIS LAP"),
            ],
            total_laps=57,
        )

        assert periods == [
            {"kind": VIRTUAL_SAFETY_CAR, "startLap": 5, "endLap": 7},
            {"kind": SAFETY_CAR, "startLap": 40, "endLap": 44},
        ]

    def test_a_period_never_closed_runs_to_the_end_of_the_race(self):
        """A race can finish under the safety car."""
        periods = safety_car_periods([msg(55, "SAFETY CAR DEPLOYED")], total_laps=57)

        assert periods == [{"kind": SAFETY_CAR, "startLap": 55, "endLap": 57}]

    def test_a_red_flag_opens_a_period_that_a_green_flag_closes(self):
        periods = safety_car_periods(
            [
                msg(20, "RED FLAG", flag="RED"),
                msg(24, "GREEN LIGHT - PIT EXIT OPEN", flag="GREEN"),
            ],
            total_laps=57,
        )

        assert periods == [{"kind": RED_FLAG, "startLap": 20, "endLap": 24}]

    def test_ignores_messages_with_no_lap(self):
        """Pre-race and post-race notes cannot be placed on a lap axis."""
        periods = safety_car_periods(
            [
                msg(None, "SAFETY CAR DEPLOYED"),
                msg(None, "SAFETY CAR IN THIS LAP"),
            ],
            total_laps=57,
        )

        assert periods == []

    def test_repeated_deployments_do_not_stack(self):
        """Race control repeats a deployment message; it is one period."""
        periods = safety_car_periods(
            [
                msg(12, "SAFETY CAR DEPLOYED"),
                msg(13, "SAFETY CAR DEPLOYED"),
                msg(16, "SAFETY CAR IN THIS LAP"),
            ],
            total_laps=57,
        )

        assert periods == [{"kind": SAFETY_CAR, "startLap": 12, "endLap": 16}]

    def test_an_end_without_a_deployment_is_ignored(self):
        periods = safety_car_periods([msg(16, "SAFETY CAR IN THIS LAP")], total_laps=57)

        assert periods == []

    def test_unrelated_messages_are_ignored(self):
        periods = safety_car_periods(
            [
                msg(3, "DRS ENABLED", category="Drs"),
                msg(9, "CAR 44 (HAM) TIME 1:32.000 DELETED - TRACK LIMITS"),
                msg(14, "YELLOW IN TRACK SECTOR 3", flag="YELLOW"),
            ],
            total_laps=57,
        )

        assert periods == []

    def test_periods_are_ordered_by_start_lap(self):
        periods = safety_car_periods(
            [
                msg(40, "SAFETY CAR DEPLOYED"),
                msg(44, "SAFETY CAR IN THIS LAP"),
                msg(5, "VIRTUAL SAFETY CAR DEPLOYED"),
                msg(7, "VIRTUAL SAFETY CAR ENDING"),
            ],
            total_laps=57,
        )

        assert [p["startLap"] for p in periods] == [5, 40]

    def test_no_messages(self):
        assert safety_car_periods([], total_laps=57) == []

    def test_unclosed_period_with_no_known_lap_count(self):
        periods = safety_car_periods([msg(30, "SAFETY CAR DEPLOYED")], total_laps=0)

        assert periods == [{"kind": SAFETY_CAR, "startLap": 30, "endLap": 30}]


class TestWeatherSummary:
    def sample(self, **kwargs):
        base = {
            "airTemp": 25.0,
            "trackTemp": 40.0,
            "humidity": 50.0,
            "windSpeed": 2.0,
            "rainfall": False,
        }
        base.update(kwargs)
        return base

    def test_reports_ranges_and_averages(self):
        summary = weather_summary(
            [
                self.sample(airTemp=20.0, trackTemp=35.0, humidity=40.0, windSpeed=1.0),
                self.sample(airTemp=30.0, trackTemp=45.0, humidity=60.0, windSpeed=5.0),
            ]
        )

        assert summary["airTempMin"] == 20.0
        assert summary["airTempMax"] == 30.0
        assert summary["trackTempMin"] == 35.0
        assert summary["trackTempMax"] == 45.0
        assert summary["humidityAvg"] == 50.0
        assert summary["windSpeedMax"] == 5.0

    def test_a_dry_race(self):
        summary = weather_summary([self.sample(), self.sample()])

        assert summary["rainfall"] is False
        assert summary["wetShare"] == 0.0

    def test_reports_the_share_of_the_session_that_was_wet(self):
        summary = weather_summary(
            [self.sample(rainfall=True), self.sample(), self.sample(), self.sample()]
        )

        assert summary["rainfall"] is True
        assert summary["wetShare"] == 0.25

    def test_tolerates_missing_channels(self):
        summary = weather_summary([{"airTemp": None, "rainfall": False}])

        assert summary["airTempMin"] is None
        assert summary["samples"] == 1

    def test_no_samples(self):
        assert weather_summary([]) is None


@pytest.fixture()
def race_conditions(race_seed_data, db):
    from src.db.models import LapTime, RaceControlMessage, RaceWeather

    db.add_all(
        [
            RaceWeather(
                id="w1",
                race_id="race-1",
                session_time_ms=0,
                air_temp=22.0,
                track_temp=38.0,
                humidity=45.0,
                wind_speed=1.5,
                rainfall=False,
            ),
            RaceWeather(
                id="w2",
                race_id="race-1",
                session_time_ms=60_000,
                air_temp=24.0,
                track_temp=42.0,
                humidity=41.0,
                wind_speed=3.0,
                rainfall=True,
            ),
            RaceControlMessage(
                id="rc1", race_id="race-1", lap=12, category="Other", message="SAFETY CAR DEPLOYED"
            ),
            RaceControlMessage(
                id="rc2",
                race_id="race-1",
                lap=16,
                category="Other",
                message="SAFETY CAR IN THIS LAP",
            ),
            LapTime(id="lt1", race_id="race-1", driver_id="driver-1", lap_number=57),
        ]
    )
    db.commit()


class TestConditionsEndpoints:
    def test_weather_returns_samples_and_a_summary(self, client, race_conditions):
        body = client.get("/api/seasons/2023/races/1/weather").json()

        assert len(body["samples"]) == 2
        assert body["summary"]["airTempMin"] == 22.0
        assert body["summary"]["airTempMax"] == 24.0
        assert body["summary"]["rainfall"] is True

    def test_weather_for_a_race_without_data(self, client, race_seed_data):
        body = client.get("/api/seasons/2023/races/1/weather").json()

        assert body["samples"] == []
        assert body["summary"] is None

    def test_weather_unknown_race_is_404(self, client, race_seed_data):
        assert client.get("/api/seasons/2023/races/99/weather").status_code == 404

    def test_race_control_derives_periods(self, client, race_conditions):
        body = client.get("/api/seasons/2023/races/1/race-control").json()

        assert body["totalLaps"] == 57
        assert body["periods"] == [{"kind": SAFETY_CAR, "startLap": 12, "endLap": 16}]
        assert len(body["messages"]) == 2

    def test_race_control_for_a_race_without_data(self, client, race_seed_data):
        body = client.get("/api/seasons/2023/races/1/race-control").json()

        assert body["periods"] == []
        assert body["messages"] == []

    def test_race_control_unknown_race_is_404(self, client, race_seed_data):
        assert client.get("/api/seasons/2023/races/99/race-control").status_code == 404
