from __future__ import annotations

from collections import defaultdict
from datetime import date
from pathlib import Path

from jinja2 import Template

from .models import Article


SECTIONS = [
    "Top Hong Kong PPP/Infrastructure Updates",
    "Policy & Regulatory Watch",
    "Project Pipeline",
    "Market/Finance Notes",
    "Further Reading",
]


HTML_TEMPLATE = Template(
    """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{{ subject }}</title>
  <style>
    body { font-family: Arial, "Noto Sans TC", sans-serif; color: #202124; line-height: 1.55; margin: 0; padding: 0; background: #f6f7f8; }
    .wrap { max-width: 760px; margin: 0 auto; background: #ffffff; padding: 28px; }
    h1 { font-size: 26px; margin: 0 0 8px; }
    h2 { border-top: 1px solid #d9dee3; padding-top: 22px; margin-top: 28px; font-size: 20px; }
    h3 { font-size: 16px; margin-bottom: 4px; }
    .meta { color: #65717d; font-size: 13px; }
    .item { margin-bottom: 20px; }
    .label { font-weight: 700; }
    a { color: #075aaa; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>{{ subject }}</h1>
    <p class="meta">Draft generated for human review. Please verify all links and summaries before sending.</p>

    <h2>Executive Summary</h2>
    <p>{{ executive_summary }}</p>

    {% for section in sections %}
      <h2>{{ section }}</h2>
      {% if grouped.get(section) %}
        {% for article in grouped[section] %}
          <div class="item">
            <h3><a href="{{ article.url }}">{{ article.title }}</a></h3>
            <p class="meta">{{ article.source }}{% if article.publish_date %} · {{ article.publish_date }}{% endif %}</p>
            <p><span class="label">EN:</span> {{ article.summary_en }}</p>
            <p><span class="label">繁中:</span> {{ article.summary_zh }}</p>
            <p><span class="label">Why it matters:</span> {{ article.why_it_matters }}</p>
          </div>
        {% endfor %}
      {% else %}
        <p class="meta">No selected items this week.</p>
      {% endif %}
    {% endfor %}
  </div>
</body>
</html>
"""
)


def render_newsletter(articles: list[Article], output_dir: Path | None = None) -> tuple[str, str, Path]:
    issue_date = date.today().isoformat()
    subject = f"Hong Kong PPP Weekly Brief - {issue_date}"
    grouped = defaultdict(list)
    for article in sorted(articles, key=lambda item: item.relevance_score, reverse=True):
        section = article.category if article.category in SECTIONS else "Further Reading"
        grouped[section].append(article)
    top_titles = [article.title for article in sorted(articles, key=lambda item: item.relevance_score, reverse=True)[:3]]
    executive_summary = (
        "This week highlights Hong Kong PPP, infrastructure, public works, and infrastructure-finance updates. "
        + ("Key items include: " + "; ".join(top_titles) + "." if top_titles else "No high-confidence items were selected.")
    )
    html = HTML_TEMPLATE.render(
        subject=subject,
        executive_summary=executive_summary,
        sections=SECTIONS,
        grouped=grouped,
    )
    output_dir = output_dir or Path(".newsletter_data")
    output_dir.mkdir(exist_ok=True)
    html_path = output_dir / f"newsletter-{issue_date}.html"
    html_path.write_text(html, encoding="utf-8")
    return subject, html, html_path

