from pathlib import Path
from datetime import date

import pytest

from newsletter.ai import FALLBACK_SUMMARY_ZH, LEGACY_FALLBACK_WHY_IT_MATTERS
from newsletter.cli import DEFAULT_LIMIT_PER_SOURCE, DEFAULT_MAX_ITEMS, DEFAULT_LOOKBACK_DAYS, generate
from newsletter.config import Settings
from newsletter.models import Article


@pytest.fixture(autouse=True)
def fixed_newsletter_date(monkeypatch):
    """Keep the news-age checks stable as the real calendar advances."""
    class FixedDate(date):
        @classmethod
        def today(cls):
            return cls(2026, 6, 20)

    monkeypatch.setattr("newsletter.cli.date", FixedDate)


class FakeStore:
    def __init__(self, articles):
        self.articles = articles
        self.written_articles = []
        self.issues = []

    def read_articles(self):
        return self.articles

    def write_articles(self, articles):
        self.written_articles = list(articles)

    def append_issue(self, issue):
        self.issues.append(issue)


def test_generate_refreshes_stale_summarized_articles(monkeypatch, tmp_path):
    stale = Article(
        title="Long stale title",
        url="https://example.com/stale",
        source="Test Source",
        publish_date="2026-06-18",
        relevance_score=50,
        category="Project Pipeline",
        status="summarized",
        summary_zh=FALLBACK_SUMMARY_ZH,
        why_it_matters=LEGACY_FALLBACK_WHY_IT_MATTERS,
    )
    fresh = Article(
        title="Fresh title",
        url="https://example.com/fresh",
        source="Test Source",
        publish_date="2026-06-18",
        relevance_score=40,
        category="Project Pipeline",
        status="summarized",
        summary_zh="這是一段具體新聞摘要。",
        why_it_matters="這會影響香港基建採購。",
    )
    store = FakeStore([stale, fresh])
    settings = Settings(
        openai_api_key="test-key",
        openai_base_url="https://api.example.com/v1",
        openai_model="test-model",
        google_service_account_json=None,
        google_sheet_id=None,
        brevo_api_key=None,
        brevo_sender_email=None,
        brevo_sender_name="Test Sender",
        brevo_list_id=None,
        local_data_dir=tmp_path,
        recency_days=30,
    )

    def fake_summarize(article, settings):
        article.title_zh = "已更新標題"
        article.summary_zh = "已更新的具體新聞摘要。"
        article.why_it_matters = "已更新的具體影響。"
        article.status = "summarized"
        return article

    monkeypatch.setattr("newsletter.cli.get_settings", lambda: settings)
    monkeypatch.setattr("newsletter.cli.get_store", lambda settings: store)
    monkeypatch.setattr("newsletter.cli.summarize_article", fake_summarize)

    _, html, path = generate()

    assert "已更新的具體新聞摘要。" in html
    assert FALLBACK_SUMMARY_ZH not in [article.summary_zh for article in store.written_articles]
    assert Path(path).exists()
    assert len(store.issues) == 1


def test_generate_defaults_to_monthly_volume_and_filters_old_articles(monkeypatch, tmp_path):
    recent_articles = [
        Article(
            title=f"Recent title {index}",
            url=f"https://example.com/recent-{index}",
            source="Test Source",
            publish_date="2026-06-18",
            relevance_score=50 - index,
            category="Project Pipeline",
            status="summarized",
            summary_en=f"Recent English summary {index}.",
            summary_zh=f"最近新聞摘要 {index}。",
            why_it_matters=f"最近新聞影響 {index}。",
        )
        for index in range(35)
    ]
    old_article = Article(
        title="Old title",
        url="https://example.com/old",
        source="Test Source",
        publish_date="2026-04-01",
        relevance_score=100,
        category="Project Pipeline",
        status="summarized",
        summary_en="Old English summary.",
        summary_zh="舊新聞摘要。",
        why_it_matters="舊新聞影響。",
    )
    store = FakeStore([old_article, *recent_articles])
    settings = Settings(
        openai_api_key="test-key",
        openai_base_url="https://api.example.com/v1",
        openai_model="test-model",
        google_service_account_json=None,
        google_sheet_id=None,
        brevo_api_key=None,
        brevo_sender_email=None,
        brevo_sender_name="Test Sender",
        brevo_list_id=None,
        local_data_dir=tmp_path,
        recency_days=30,
    )

    monkeypatch.setattr("newsletter.cli.get_settings", lambda: settings)
    monkeypatch.setattr("newsletter.cli.get_store", lambda settings: store)

    _, html, _ = generate()

    assert DEFAULT_LIMIT_PER_SOURCE == 100
    assert DEFAULT_MAX_ITEMS == 30
    assert DEFAULT_LOOKBACK_DAYS == 31
    assert "Old title" not in html
    assert html.count("Read original") == 30


def test_generate_allows_fewer_than_monthly_target_when_relevant_news_is_limited(monkeypatch, tmp_path):
    primary_articles = [
        Article(
            title=f"Primary title {index}",
            url=f"https://example.com/primary-{index}",
            source="Test Source",
            publish_date="2026-06-18",
            relevance_score=20,
            category="Project Pipeline",
            status="summarized",
            summary_en=f"Primary English summary {index}.",
            summary_zh=f"主要新聞摘要 {index}。",
            why_it_matters=f"主要新聞影響 {index}。",
        )
        for index in range(25)
    ]
    low_score_articles = [
        Article(
            title=f"Hong Kong infrastructure low score story {index}",
            url=f"https://example.com/low-score-{index}",
            source="Test Source",
            publish_date="2026-06-18",
            relevance_score=5,
            category="Project Pipeline",
            status="rejected",
            summary_en=f"Backfill English summary {index}.",
            summary_zh=f"補充新聞摘要 {index}。",
            why_it_matters=f"補充新聞影響 {index}。",
        )
        for index in range(8)
    ]
    noisy_article = Article(
        title="Open in new window - Hong Kong Transport Department website",
        url="https://example.com/noise",
        source="Test Source",
        publish_date="2026-06-18",
        relevance_score=8,
        category="Top Hong Kong PPP/Infrastructure Updates",
        status="rejected",
        summary_en="Noise.",
        summary_zh="雜訊。",
        why_it_matters="雜訊。",
    )
    store = FakeStore([*primary_articles, noisy_article, *low_score_articles])
    settings = Settings(
        openai_api_key="test-key",
        openai_base_url="https://api.example.com/v1",
        openai_model="test-model",
        google_service_account_json=None,
        google_sheet_id=None,
        brevo_api_key=None,
        brevo_sender_email=None,
        brevo_sender_name="Test Sender",
        brevo_list_id=None,
        local_data_dir=tmp_path,
        recency_days=30,
    )

    monkeypatch.setattr("newsletter.cli.get_settings", lambda: settings)
    monkeypatch.setattr("newsletter.cli.get_store", lambda settings: store)

    _, html, _ = generate()

    assert html.count("Read original") == 25
    assert "Hong Kong infrastructure low score story" not in html
    assert "Open in new window" not in html


def test_generate_filters_mojibake_navigation_titles(monkeypatch, tmp_path):
    news_article = Article(
        title="Real Hong Kong infrastructure update",
        url="https://example.com/news",
        source="Test Source",
        publish_date="2026-06-18",
        relevance_score=20,
        category="Project Pipeline",
        status="summarized",
        summary_en="Real summary.",
        summary_zh="真實新聞摘要。",
        why_it_matters="真實新聞影響。",
    )
    navigation_article = Article(
        title="è·³è³ä¸»è¦å §å®¹",
        url="https://example.com/skip",
        source="Test Source",
        publish_date="2026-06-18",
        relevance_score=8,
        category="Top Hong Kong PPP/Infrastructure Updates",
        status="summarized",
        summary_en="Navigation text.",
        summary_zh="導覽文字。",
        why_it_matters="導覽文字。",
    )
    store = FakeStore([news_article, navigation_article])
    settings = Settings(
        openai_api_key="test-key",
        openai_base_url="https://api.example.com/v1",
        openai_model="test-model",
        google_service_account_json=None,
        google_sheet_id=None,
        brevo_api_key=None,
        brevo_sender_email=None,
        brevo_sender_name="Test Sender",
        brevo_list_id=None,
        local_data_dir=tmp_path,
        recency_days=30,
    )

    monkeypatch.setattr("newsletter.cli.get_settings", lambda: settings)
    monkeypatch.setattr("newsletter.cli.get_store", lambda settings: store)

    _, html, _ = generate()

    assert "Real Hong Kong infrastructure update" in html
    assert "è·³" not in html
    assert "跳至主要內容" not in html
