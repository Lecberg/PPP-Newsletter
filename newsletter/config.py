from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


DEFAULT_KEYWORDS = [
    "public private partnership",
    "public-private partnership",
    "PPP",
    "P3",
    "infrastructure finance",
    "project finance",
    "concession",
    "BOT",
    "DBFOM",
    "public works",
    "Northern Metropolis",
    "San Tin Technopole",
    "urban renewal",
    "transport infrastructure",
    "公私營合作",
    "公私營伙伴",
    "基建融資",
    "項目融資",
    "特許經營",
    "北部都會區",
    "新田科技城",
    "交椅洲人工島",
    "市區重建",
    "公共工程",
]

DEFAULT_SOURCES = [
    {
        "name": "HKSAR Government Press Releases",
        "url": "https://www.info.gov.hk/gia/general/ctoday.htm",
        "source_type": "official_html",
        "priority": "1",
        "enabled": "TRUE",
    },
    {
        "name": "news.gov.hk Infrastructure & Logistics",
        "url": "https://www.news.gov.hk/eng/index.html",
        "source_type": "official_html",
        "priority": "1",
        "enabled": "TRUE",
    },
    {
        "name": "Development Bureau Press Releases",
        "url": "https://www.devb.gov.hk/en/publications_and_press_releases/press/index.html",
        "source_type": "official_html",
        "priority": "1",
        "enabled": "TRUE",
    },
    {
        "name": "Civil Engineering and Development Department Projects",
        "url": "https://www.cedd.gov.hk/eng/our-projects/index.html",
        "source_type": "official_html",
        "priority": "1",
        "enabled": "TRUE",
    },
    {
        "name": "Legislative Council",
        "url": "https://www.legco.gov.hk/en/index.html",
        "source_type": "official_html",
        "priority": "1",
        "enabled": "TRUE",
    },
    {
        "name": "Government Gazette",
        "url": "https://egazette.gld.gov.hk/en/whats-new",
        "source_type": "official_html",
        "priority": "1",
        "enabled": "TRUE",
    },
    {
        "name": "Transport and Logistics Bureau",
        "url": "https://www.tlb.gov.hk/eng/index.html",
        "source_type": "official_html",
        "priority": "2",
        "enabled": "TRUE",
    },
    {
        "name": "Urban Renewal Authority",
        "url": "https://www.ura.org.hk/en/media/press-release",
        "source_type": "official_html",
        "priority": "2",
        "enabled": "TRUE",
    },
    {
        "name": "South China Morning Post Hong Kong",
        "url": "https://www.scmp.com/rss/2/feed",
        "source_type": "rss",
        "priority": "3",
        "enabled": "TRUE",
    },
    {
        "name": "The Standard Hong Kong",
        "url": "https://www.thestandard.com.hk/latest-news",
        "source_type": "media_html",
        "priority": "3",
        "enabled": "TRUE",
    },
]


@dataclass(frozen=True)
class Settings:
    openai_api_key: str | None
    openai_base_url: str
    openai_model: str
    google_service_account_json: str | None
    google_sheet_id: str | None
    brevo_api_key: str | None
    brevo_sender_email: str | None
    brevo_sender_name: str
    brevo_list_id: int | None
    local_data_dir: Path


def load_dotenv(path: Path = Path(".env")) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def get_settings() -> Settings:
    load_dotenv()
    brevo_list_id = os.getenv("BREVO_LIST_ID")
    return Settings(
        openai_api_key=os.getenv("OPENAI_COMPATIBLE_API_KEY"),
        openai_base_url=os.getenv("OPENAI_COMPATIBLE_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        google_service_account_json=os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON"),
        google_sheet_id=os.getenv("GOOGLE_SHEET_ID"),
        brevo_api_key=os.getenv("BREVO_API_KEY"),
        brevo_sender_email=os.getenv("BREVO_SENDER_EMAIL"),
        brevo_sender_name=os.getenv("BREVO_SENDER_NAME", "Hong Kong PPP Weekly"),
        brevo_list_id=int(brevo_list_id) if brevo_list_id and brevo_list_id.isdigit() else None,
        local_data_dir=Path(".newsletter_data"),
    )
