"""GitHub draft runner. It creates campaigns only; it never sends email."""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

import requests

from .config import get_settings
from .storage import get_store
from .schedule import Schedule


class SnapshotStore:
    def __init__(self, store, config, sources):
        self.store, self.config, self.sources = store, dict(config), list(sources)

    def read_config(self):
        return dict(self.config)

    def read_sources(self):
        return list(self.sources)

    def __getattr__(self, name):
        return getattr(self.store, name)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scheduled", action="store_true")
    parser.add_argument("--request-id", default="")
    parser.add_argument("--environment", choices=["production", "preview"], default="production")
    parser.add_argument("--result-path", default="draft-result.json")
    args = parser.parse_args()
    request_id = str(UUID(args.request_id)) if args.request_id else str(uuid4())
    result = {"request_id": request_id, "run_id": os.getenv("GITHUB_RUN_ID", ""), "environment": args.environment, "outcome": "failed"}
    creating = False
    exit_code = 1
    try:
        if int(os.getenv("GITHUB_RUN_ATTEMPT", "1")) != 1:
            raise ValueError("Do not rerun draft creation. Submit a fresh portal request instead.")
        if args.environment == "preview":
            production_sheet, production_list = os.getenv("GOOGLE_SHEET_ID"), os.getenv("BREVO_LIST_ID")
            for key in ["GOOGLE_SERVICE_ACCOUNT_JSON", "GOOGLE_SHEET_ID", "BREVO_API_KEY", "BREVO_LIST_ID", "BREVO_SENDER_EMAIL", "BREVO_SENDER_NAME"]:
                value = os.getenv("PORTAL_PREVIEW_" + key)
                if not value:
                    raise ValueError("Preview credentials are incomplete. Production credentials will not be used.")
                os.environ[key] = value
            if os.environ["GOOGLE_SHEET_ID"] == production_sheet or os.environ["BREVO_LIST_ID"] == production_list:
                raise ValueError("Preview requires a separate Sheet and mailing list.")
        settings = get_settings()
        if not settings.google_sheet_id or not settings.google_service_account_json:
            raise ValueError("GitHub drafting requires configured Google Sheets credentials.")
        from .brevo import brevo_config_issues
        if brevo_config_issues(settings):
            raise ValueError("Brevo campaign credentials are incomplete.")
        store = get_store(settings)
        config, sources = store.draft_settings_snapshot()
        snapshot = SnapshotStore(store, config, sources)
        schedule = Schedule.from_config(config)
        now = datetime.now(timezone.utc)
        from . import cli
        if args.scheduled:
            enabled = str(config.get("automatic_drafting_enabled", "")).strip().lower() in {"true", "yes", "1", "enabled"}
            if not enabled or not schedule.matches(now) or cli._already_ran_today(snapshot, now.astimezone(schedule.tzinfo())):
                result["outcome"] = "skipped"
                return 0
        if not any(source.enabled for source in sources):
            raise ValueError("Enable at least one news source before drafting.")
        issue_day = now.astimezone(schedule.tzinfo()).date()
        cli.collect(settings=settings, store=snapshot)
        subject, html, _ = cli.generate(settings=settings, store=snapshot, issue_day=issue_day)
        creating = True
        from .brevo import create_draft_campaign
        campaign_id = create_draft_campaign(settings, subject, html, request_id=request_id)
        if not str(campaign_id).isdigit() or int(campaign_id) < 1:
            raise RuntimeError("Brevo did not return a campaign number.")
        result["campaign_id"] = int(campaign_id)
        snapshot.append_issue({"issue_date": issue_day.isoformat(), "newsletter_subject": subject, "brevo_campaign_id": campaign_id, "approval_status": "draft_created", "html_path": ""})
        result["outcome"] = "ready"
        exit_code = 0
    except Exception as error:
        definitive = isinstance(error, requests.HTTPError) and error.response is not None and error.response.status_code < 500
        result["outcome"] = "unknown" if creating and not definitive else "failed"
        result["error_type"] = type(error).__name__
        print("Draft creation stopped: " + result["outcome"] + ". No newsletter delivery was requested.")
    finally:
        Path(args.result_path).write_text(json.dumps(result), encoding="utf-8")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
