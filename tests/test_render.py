from newsletter.models import Article
from newsletter.render import SECTIONS, render_newsletter


def test_newsletter_html_renders_english_first_news_sections(tmp_path):
    article = Article(
        title="Hong Kong PPP transport update",
        url="https://example.com",
        source="Test Source",
        title_en="Hong Kong PPP transport update",
        title_zh="香港 PPP 交通項目更新",
        publish_date="2026-06-18",
        relevance_score=50,
        category="Project Pipeline",
        summary_en="A concise English summary.",
        summary_zh="一段繁體中文摘要。",
        why_it_matters="這會影響基建採購。",
        why_it_matters_en="It affects infrastructure procurement.",
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

    # English-first subject.
    assert "Hong Kong PPP Weekly Brief" in subject
    for section in SECTIONS:
        assert section in html
    # Excluded sections and their articles never render.
    assert "Market/Finance Notes" not in html
    assert "Further Reading" not in html
    assert "Infrastructure bond market update" not in html
    # English headline is primary; Chinese block is secondary (appears after).
    assert "Hong Kong PPP transport update" in html
    assert html.index("A concise English summary.") < html.index("一段繁體中文摘要。")
    assert "Why it matters" in html
    assert "It affects infrastructure procurement." in html
    # Chinese secondary content still present.
    assert "香港 PPP 交通項目更新" in html
    assert "一段繁體中文摘要。" in html
    assert "Read original" in html
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
    assert article.title_en == ""
