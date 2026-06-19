from newsletter.models import Article
from newsletter.render import SECTIONS, render_newsletter


def test_newsletter_html_renders_chinese_first_news_sections(tmp_path):
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

    assert "香港 PPP 每週簡報" in subject
    for section in SECTIONS:
        assert section in html
    assert "Market/Finance Notes" not in html
    assert "Further Reading" not in html
    assert "Infrastructure bond market update" not in html
    assert '<article class="news-item">' in html
    assert "新聞 1" in html
    assert 'class="source-link" href="https://example.com">閱讀原文</a>' in html
    assert html.index("一段繁體中文摘要。") < html.index("A concise English summary.")
    assert "香港 PPP 交通項目更新" in html
    assert "一段繁體中文摘要。" in html
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
