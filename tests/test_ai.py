import json
from pathlib import Path

from newsletter.ai import FALLBACK_SUMMARY_ZH, LEGACY_FALLBACK_WHY_IT_MATTERS, needs_ai_summary, summarize_article
from newsletter.config import Settings
from newsletter.models import Article
from newsletter.text import repair_mojibake


class FakeResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "title_zh_hant": "北都大型交通基建落成",
                                "summary_zh_hant": "一段繁體中文摘要。",
                                "why_it_matters_zh_hant": "這會影響基建採購。",
                                "summary_en": "A concise English summary.",
                            },
                            ensure_ascii=False,
                        )
                    }
                }
            ]
        }


def test_summarize_article_requests_concise_display_headline(monkeypatch):
    captured = {}

    def fake_post(url, headers, json, timeout):
        captured["payload"] = json
        return FakeResponse()

    monkeypatch.setattr("newsletter.ai.requests.post", fake_post)
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
        local_data_dir=Path(".newsletter_data"),
    )
    article = Article(
        title="Completion of first large-scale transport infrastructure in Northern Metropolis-Fanling Bypass",
        url="https://example.com",
        source="Test Source",
        excerpt="A long infrastructure update.",
    )

    summarized = summarize_article(article, settings)

    system_prompt = captured["payload"]["messages"][0]["content"]
    assert "concise display headline" in system_prompt
    assert "3-4 visual lines" in system_prompt
    assert "34-42 Traditional Chinese characters" in system_prompt
    assert summarized.title_zh == "北都大型交通基建落成"


def test_needs_ai_summary_flags_stale_fallback_content():
    stale = Article(
        title="Stale article",
        url="https://example.com/stale",
        source="Test Source",
        status="summarized",
        summary_zh=FALLBACK_SUMMARY_ZH,
        why_it_matters=LEGACY_FALLBACK_WHY_IT_MATTERS,
    )
    fresh = Article(
        title="Fresh article",
        url="https://example.com/fresh",
        source="Test Source",
        status="summarized",
        summary_zh="這是一段具體新聞摘要。",
        why_it_matters="這會影響香港基建採購。",
    )

    assert needs_ai_summary(stale)
    assert not needs_ai_summary(fresh)


def test_repair_mojibake_handles_utf8_bytes_read_as_latin1():
    assert repair_mojibake("è·³è³ä¸»è¦å §å®¹") == "跳至主要內容"
