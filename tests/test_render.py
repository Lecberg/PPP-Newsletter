from newsletter.models import Article
from newsletter.render import SECTIONS, render_newsletter


def test_newsletter_html_renders_required_sections(tmp_path):
    article = Article(
        title="Hong Kong PPP transport update",
        url="https://example.com",
        source="Test Source",
        publish_date="2026-06-18",
        relevance_score=50,
        category="Project Pipeline",
        summary_en="A concise English summary.",
        summary_zh="一段繁體中文摘要。",
        why_it_matters="It affects infrastructure procurement.",
    )
    subject, html, path = render_newsletter([article], tmp_path)
    assert "Hong Kong PPP Weekly Brief" in subject
    for section in SECTIONS:
        assert section in html
    assert "一段繁體中文摘要。" in html
    assert path.exists()

