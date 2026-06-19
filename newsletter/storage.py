from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from .config import DEFAULT_KEYWORDS, DEFAULT_SOURCES, Settings
from .models import ARTICLE_HEADERS, CONFIG_HEADERS, ISSUE_HEADERS, SOURCE_HEADERS, Article, Source


SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


class LocalStore:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.data_dir.mkdir(exist_ok=True)

    def _path(self, name: str) -> Path:
        return self.data_dir / f"{name}.json"

    def read_sources(self) -> list[Source]:
        path = self._path("Sources")
        if not path.exists():
            self.write_rows("Sources", DEFAULT_SOURCES)
        return [Source.from_row(row) for row in self.read_rows("Sources")]

    def read_articles(self) -> list[Article]:
        return [Article.from_row(row) for row in self.read_rows("Articles")]

    def write_articles(self, articles: Iterable[Article]) -> None:
        self.write_rows("Articles", [article.to_row() for article in articles])

    def append_issue(self, issue: dict[str, str]) -> None:
        rows = self.read_rows("Issues")
        rows.append(issue)
        self.write_rows("Issues", rows)

    def read_rows(self, name: str) -> list[dict[str, str]]:
        path = self._path(name)
        if not path.exists():
            return []
        return json.loads(path.read_text(encoding="utf-8"))

    def write_rows(self, name: str, rows: list[dict]) -> None:
        self._path(name).write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


class SheetStore:
    def __init__(self, settings: Settings):
        import gspread
        from google.oauth2.service_account import Credentials

        if not settings.google_service_account_json or not settings.google_sheet_id:
            raise ValueError("Google Sheets credentials are not configured.")
        service_account_info = json.loads(settings.google_service_account_json)
        credentials = Credentials.from_service_account_info(service_account_info, scopes=SCOPES)
        self.sheet = gspread.authorize(credentials).open_by_key(settings.google_sheet_id)
        self.gspread = gspread
        self.ensure_schema()

    def ensure_schema(self) -> None:
        self._ensure_worksheet("Sources", SOURCE_HEADERS, DEFAULT_SOURCES)
        self._ensure_worksheet("Articles", ARTICLE_HEADERS, [])
        self._ensure_worksheet("Issues", ISSUE_HEADERS, [])
        self._ensure_worksheet(
            "Config",
            CONFIG_HEADERS,
            [{"key": "keywords", "value": "\n".join(DEFAULT_KEYWORDS)}],
        )

    def _ensure_worksheet(self, title: str, headers: list[str], seed_rows: list[dict]) -> None:
        try:
            worksheet = self.sheet.worksheet(title)
        except self.gspread.WorksheetNotFound:
            worksheet = self.sheet.add_worksheet(title=title, rows=max(100, len(seed_rows) + 10), cols=len(headers) + 2)
            worksheet.update([headers])
        values = worksheet.get_all_values()
        if not values:
            worksheet.update([headers])
        if seed_rows and len(worksheet.get_all_records()) == 0:
            worksheet.append_rows([[row.get(header, "") for header in headers] for row in seed_rows])

    def read_sources(self) -> list[Source]:
        return [Source.from_row(row) for row in self.sheet.worksheet("Sources").get_all_records()]

    def read_articles(self) -> list[Article]:
        return [Article.from_row(row) for row in self.sheet.worksheet("Articles").get_all_records()]

    def write_articles(self, articles: Iterable[Article]) -> None:
        worksheet = self.sheet.worksheet("Articles")
        rows = [[getattr(article, header) for header in ARTICLE_HEADERS] for article in articles]
        worksheet.clear()
        worksheet.update([ARTICLE_HEADERS] + rows)

    def append_issue(self, issue: dict[str, str]) -> None:
        worksheet = self.sheet.worksheet("Issues")
        worksheet.append_row([issue.get(header, "") for header in ISSUE_HEADERS])


def get_store(settings: Settings):
    if settings.google_service_account_json and settings.google_sheet_id:
        return SheetStore(settings)
    return LocalStore(settings.local_data_dir)
