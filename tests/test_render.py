from newsletter.models import Article
from newsletter.render import SECTIONS, render_newsletter


def test_newsletter_html_renders_original_brief_sections_without_excluded_sections(tmp_path):
    article = Article(
        title="Hong Kong PPP transport update",
        url="https://example.com",
        source="Test Source",
        title_zh="香港 PPP 交通項目更新",
        publish_date="2026-06-18",
        relevance_score=50,
        category="Project Pipeline",
        summary_en="A concise English summary.",
        summary_zh="一段繁體中文摘要。",
        why_it_matters="這會影響基建採購。",
    )
    finance_article = Article(
        title="Infrastructure bond market update",
        url="https://example.com/finance",
        source="Finance Source",
        publish_date="2026-06-18",
        relevance_score=80,
        category="Market/Finance Notes",
        summary_en="A finance note.",
        summary_zh="一段金融市場摘要。",
        why_it_matters="不應出現在新聞草稿。",
    )

    subject, html, path = render_newsletter([article, finance_article], tmp_path)

    assert "Hong Kong PPP Weekly Brief" in subject
    assert "<h2>Executive Summary</h2>" in html
    for section in SECTIONS:
        assert f"<h2>{section}</h2>" in html
    assert "Market/Finance Notes" not in html
    assert "Further Reading" not in html
    assert "Infrastructure bond market update" not in html
    assert '<div class="item">' in html
    assert '<span class="label">EN:</span> A concise English summary.' in html
    assert '<span class="label">繁中:</span> 一段繁體中文摘要。' in html
    assert '<span class="label">Why it matters:</span> 這會影響基建採購。' in html
    assert path.exists()


def test_article_from_row_allows_missing_chinese_title():
    article = Article.from_row(
        {
            "title": "Original title",
            "url": "https://example.com",
            "source": "Test Source",
        }
    )

    assert article.title_zh == ""


def test_newsletter_repairs_mojibake_in_existing_articles(tmp_path):
    article = Article(
        title="Driving Hong Kongâs development with new transport infrastructure",
        url="https://example.com",
        source="Test Source",
        publish_date="2026-06-18",
        relevance_score=50,
        category="Top Hong Kong PPP/Infrastructure Updates",
        summary_en="Driving Hong Kongâs development with new transport infrastructure",
        summary_zh="一段繁體中文摘要。",
        why_it_matters="這會影響基建採購。",
    )

    _, html, _ = render_newsletter([article], tmp_path)

    assert "Driving Hong Kong’s development with new transport infrastructure" in html
    assert "Hong Kongâ" not in html
