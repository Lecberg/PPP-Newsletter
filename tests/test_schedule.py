from datetime import datetime, timezone

from newsletter import cli
from newsletter.schedule import Schedule


def test_default_schedule_matches_monday_0800_hk():
    schedule = Schedule.from_config({})
    # Monday 00:00 UTC == Monday 08:00 Asia/Hong_Kong (UTC+8).
    assert schedule.matches(datetime(2026, 8, 10, 0, 0, tzinfo=timezone.utc))
    # One hour later is 09:00 HK -> outside the slot.
    assert not schedule.matches(datetime(2026, 8, 10, 1, 0, tzinfo=timezone.utc))
    # Same hour but Tuesday -> wrong weekday.
    assert not schedule.matches(datetime(2026, 8, 11, 0, 0, tzinfo=timezone.utc))


def test_monthly_schedule_clamps_day_to_month_length():
    schedule = Schedule.from_config(
        {"cadence": "monthly", "send_day_of_month": "31", "send_hour": "9"}
    )
    # 31st clamps to Feb 28 (2026 is not a leap year); 09:00 HK == 01:00 UTC.
    assert schedule.matches(datetime(2026, 2, 28, 1, 0, tzinfo=timezone.utc))
    assert schedule.matches(datetime(2026, 3, 31, 1, 0, tzinfo=timezone.utc))
    assert not schedule.matches(datetime(2026, 3, 30, 1, 0, tzinfo=timezone.utc))


def test_from_config_falls_back_on_invalid_values():
    schedule = Schedule.from_config(
        {
            "cadence": "daily",
            "send_weekday": "funday",
            "send_hour": "99",
            "send_day_of_month": "0",
        }
    )
    assert schedule.cadence == "weekly"
    assert schedule.send_weekday == "monday"
    assert schedule.send_hour == 23  # clamped into 0-23
    assert schedule.send_day_of_month == 1  # clamped into 1-31


class FakeStore:
    def __init__(self, config, issues=None):
        self.config = config
        self.issues = issues or []

    def read_config(self):
        return self.config

    def read_issues(self):
        return self.issues


def _patch(monkeypatch, store, ran):
    monkeypatch.setattr(cli, "get_settings", lambda: object())
    monkeypatch.setattr(cli, "get_store", lambda settings: store)
    monkeypatch.setattr(cli, "run_weekly", lambda **kwargs: ran.append(kwargs))


def test_run_scheduled_skips_outside_slot(monkeypatch):
    store = FakeStore(config={"automatic_drafting_enabled": "TRUE"})  # default: Monday 08:00 HK
    ran = []
    _patch(monkeypatch, store, ran)
    # Tuesday -> should not run.
    did_run = cli.run_scheduled(now=datetime(2026, 8, 11, 0, 0, tzinfo=timezone.utc))
    assert did_run is False
    assert ran == []


def test_run_scheduled_runs_inside_slot(monkeypatch):
    store = FakeStore(config={"automatic_drafting_enabled": "TRUE"})
    ran = []
    _patch(monkeypatch, store, ran)
    did_run = cli.run_scheduled(now=datetime(2026, 8, 10, 0, 0, tzinfo=timezone.utc))
    assert did_run is True
    assert len(ran) == 1


def test_run_scheduled_skips_when_already_ran_today(monkeypatch):
    store = FakeStore(config={"automatic_drafting_enabled": "TRUE"}, issues=[{"issue_date": "2026-08-10", "brevo_campaign_id": "123"}])
    ran = []
    _patch(monkeypatch, store, ran)
    did_run = cli.run_scheduled(now=datetime(2026, 8, 10, 0, 0, tzinfo=timezone.utc))
    assert did_run is False
    assert ran == []


def test_run_scheduled_stays_off_by_default(monkeypatch):
    store = FakeStore(config={})
    ran = []
    _patch(monkeypatch, store, ran)
    assert cli.run_scheduled(now=datetime(2026, 8, 10, 0, 0, tzinfo=timezone.utc)) is False
    assert ran == []
