from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

WEEKDAYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]

# Client-editable delivery settings, stored as key/value rows in the Config tab.
DEFAULT_SCHEDULE = {
    "cadence": "weekly",  # weekly | monthly
    "send_weekday": "monday",  # used when cadence = weekly
    "send_day_of_month": "1",  # used when cadence = monthly (clamped to month length)
    "send_hour": "8",  # 0-23, in the timezone below
    "timezone": "Asia/Hong_Kong",
}


def _safe_int(value: str, default: int, lo: int, hi: int) -> int:
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, parsed))


@dataclass(frozen=True)
class Schedule:
    cadence: str
    send_weekday: str
    send_day_of_month: int
    send_hour: int
    timezone: str

    @classmethod
    def from_config(cls, config: dict[str, str]) -> "Schedule":
        merged = dict(DEFAULT_SCHEDULE)
        for key in DEFAULT_SCHEDULE:
            raw = str(config.get(key, "")).strip()
            if raw:
                merged[key] = raw

        cadence = merged["cadence"].lower()
        if cadence not in {"weekly", "monthly"}:
            cadence = "weekly"

        weekday = merged["send_weekday"].lower()
        if weekday not in WEEKDAYS:
            weekday = "monday"

        return cls(
            cadence=cadence,
            send_weekday=weekday,
            send_day_of_month=_safe_int(merged["send_day_of_month"], 1, lo=1, hi=31),
            send_hour=_safe_int(merged["send_hour"], 8, lo=0, hi=23),
            timezone=merged["timezone"] or "Asia/Hong_Kong",
        )

    def tzinfo(self) -> ZoneInfo:
        try:
            return ZoneInfo(self.timezone)
        except Exception:
            return ZoneInfo("Asia/Hong_Kong")

    def matches(self, now_utc: datetime) -> bool:
        """True when `now_utc` falls in the configured one-hour delivery slot.

        The scheduler is expected to fire hourly; matching on the hour (not the
        minute) absorbs the several-minute delays that cron runners can have.
        """
        local = now_utc.astimezone(self.tzinfo())
        if local.hour != self.send_hour:
            return False
        if self.cadence == "weekly":
            return WEEKDAYS[local.weekday()] == self.send_weekday
        last_day = calendar.monthrange(local.year, local.month)[1]
        target_day = min(self.send_day_of_month, last_day)
        return local.day == target_day

    def describe(self) -> str:
        if self.cadence == "weekly":
            when = f"every {self.send_weekday.capitalize()}"
        else:
            when = f"day {self.send_day_of_month} of each month"
        return f"{when} at {self.send_hour:02d}:00 {self.timezone}"
