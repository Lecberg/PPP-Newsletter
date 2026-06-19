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
]

EXCLUDED_SECTIONS = {"Market/Finance Notes", "Further Reading"}


HTML_TEMPLATE = Template(
    """
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <title>{{ subject }}</title>
  <style>
    body { font-family: Arial, "Noto Sans TC", sans-serif; color: #202124; line-height: 1.55; margin: 0; padding: 0; background: #f6f7f8; }
    .wrap { max-width: 760px; margin: 0 auto; background: #ffffff; padding: 28px; }
    h1 { font-size: 26px; margin: 0 0 8px; }
    h2 { border-top: 1px solid #d9dee3; padding-top: 22px; margin-top: 28px; font-size: 20px; }
    h3 { font-size: 18px; margin: 0 0 8px; }
    .meta { color: #65717d; font-size: 13px; }
    .news-item { border: 1px solid #d9dee3; border-left: 5px solid #075aaa; padding: 18px 20px; margin: 0 0 22px; background: #fbfcfd; }
    .item-marker { color: #075aaa; font-size: 13px; font-weight: 700; margin: 0 0 6px; }
    .source-link { font-weight: 700; }
    .english-note { color: #4f5b66; font-size: 13px; border-top: 1px solid #e6eaee; margin-top: 14px; padding-top: 12px; }
    .label { font-weight: 700; }
    a { color: #075aaa; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>{{ subject }}</h1>
    <p class="meta">供編輯審閱的草稿。發送前請核實所有連結及摘要。</p>

    <h2>重點摘要</h2>
    <p>{{ executive_summary }}</p>

    {% for section in sections %}
      <h2>{{ section }}</h2>
      {% if grouped.get(section) %}
        {% for article in grouped[section] %}
          <article class="news-item">
            <p class="item-marker">新聞 {{ loop.index }}</p>
            <h3><a href="{{ article.url }}">{{ article.title_zh or article.title }}</a></h3>
            <p class="meta">{{ article.source }}{% if article.publish_date %} · {{ article.publish_date }}{% endif %}</p>
            <p><span class="label">摘要：</span> {{ article.summary_zh }}</p>
            <p><span class="label">影響：</span> {{ article.why_it_matters }}</p>
            <p><a class="source-link" href="{{ article.url }}">閱讀原文</a></p>
            {% if article.summary_en %}
              <p class="english-note"><span class="label">English brief:</span> {{ article.summary_en }}</p>
            {% endif %}
          </article>
        {% endfor %}
      {% else %}
        <p class="meta">本週未有入選新聞。</p>
      {% endif %}
    {% endfor %}
  </div>
</body>
</html>
"""
)


def render_newsletter(articles: list[Article], output_dir: Path | None = None) -> tuple[str, str, Path]:
    issue_date = date.today().isoformat()
    subject = f"香港 PPP 每週簡報 - {issue_date}"
    grouped = defaultdict(list)
    selected_articles = [
        article
        for article in articles
        if article.category in SECTIONS and article.category not in EXCLUDED_SECTIONS
    ]
    for article in sorted(selected_articles, key=lambda item: item.relevance_score, reverse=True):
        section = article.category
        grouped[section].append(article)
    top_titles = [
        article.title_zh or article.title
        for article in sorted(selected_articles, key=lambda item: item.relevance_score, reverse=True)[:3]
    ]
    executive_summary = (
        "本週聚焦香港公私營合作、基建及公共工程相關新聞。"
        + ("重點包括：" + "；".join(top_titles) + "。" if top_titles else "本週未有高信心入選新聞。")
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
