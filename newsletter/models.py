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
    title_zh: str = ""
    title_en: str = ""
    publish_date: str = ""
    excerpt: str = ""
    relevance_score: int = 0
    category: str = ""
    status: str = "new"
    summary_en: str = ""
    summary_zh: str = ""
    why_it_matters: str = ""
    why_it_matters_en: str = ""

    def to_row(self) -> dict[str, str | int]:
        return asdict(self)

    @classmethod
    def from_row(cls, row: dict[str, str]) -> "Article":
        from .collectors import fix_mojibake

        return cls(
            title=fix_mojibake(row.get("title", "")),
            url=row.get("url", ""),
            source=row.get("source", ""),
            title_zh=row.get("title_zh", ""),
            title_en=fix_mojibake(row.get("title_en", "")),
            publish_date=row.get("publish_date", ""),
            excerpt=fix_mojibake(row.get("excerpt", "")),
            relevance_score=int(row.get("relevance_score", "0") or 0),
            category=row.get("category", ""),
            status=row.get("status", "new"),
            summary_en=fix_mojibake(row.get("summary_en", "")),
            summary_zh=row.get("summary_zh", ""),
            why_it_matters=row.get("why_it_matters", ""),
            why_it_matters_en=fix_mojibake(row.get("why_it_matters_en", "")),
        )


ARTICLE_HEADERS = [
    "title",
    "url",
    "source",
    "title_zh",
    "publish_date",
    "excerpt",
    "relevance_score",
    "category",
    "status",
    "summary_en",
    "summary_zh",
    "why_it_matters",
    "title_en",
    "why_it_matters_en",
]

SOURCE_HEADERS = ["name", "url", "source_type", "priority", "enabled"]
ISSUE_HEADERS = ["issue_date", "newsletter_subject", "brevo_campaign_id", "approval_status", "html_path"]
CONFIG_HEADERS = ["key", "value"]
