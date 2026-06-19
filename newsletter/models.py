from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass
class Source:
    name: str
    url: str
    source_type: str
    priority: int = 3
    enabled: bool = True

    @classmethod
    def from_row(cls, row: dict[str, str]) -> "Source":
        enabled = str(row.get("enabled", "TRUE")).strip().lower() in {"true", "yes", "1", "enabled"}
        return cls(
            name=row.get("name", "").strip(),
            url=row.get("url", "").strip(),
            source_type=row.get("source_type", "html").strip() or "html",
            priority=int(row.get("priority", "3") or 3),
            enabled=enabled,
        )


@dataclass
class Article:
    title: str
    url: str
    source: str
    publish_date: str = ""
    excerpt: str = ""
    relevance_score: int = 0
    category: str = ""
    status: str = "new"
    summary_en: str = ""
    summary_zh: str = ""
    why_it_matters: str = ""

    def to_row(self) -> dict[str, str | int]:
        return asdict(self)

    @classmethod
    def from_row(cls, row: dict[str, str]) -> "Article":
        return cls(
            title=row.get("title", ""),
            url=row.get("url", ""),
            source=row.get("source", ""),
            publish_date=row.get("publish_date", ""),
            excerpt=row.get("excerpt", ""),
            relevance_score=int(row.get("relevance_score", "0") or 0),
            category=row.get("category", ""),
            status=row.get("status", "new"),
            summary_en=row.get("summary_en", ""),
            summary_zh=row.get("summary_zh", ""),
            why_it_matters=row.get("why_it_matters", ""),
        )


ARTICLE_HEADERS = [
    "title",
    "url",
    "source",
    "publish_date",
    "excerpt",
    "relevance_score",
    "category",
    "status",
    "summary_en",
    "summary_zh",
    "why_it_matters",
]

SOURCE_HEADERS = ["name", "url", "source_type", "priority", "enabled"]
ISSUE_HEADERS = ["issue_date", "newsletter_subject", "brevo_campaign_id", "approval_status", "html_path"]
CONFIG_HEADERS = ["key", "value"]

