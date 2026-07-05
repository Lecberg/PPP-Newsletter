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


SERIF = "Georgia, 'Times New Roman', Times, serif"
SANS = "-apple-system, 'Segoe UI', Roboto, Arial, Helvetica, sans-serif"
CJK = "'PingFang TC', 'Microsoft JhengHei', 'Heiti TC', 'Noto Sans TC', sans-serif"

HTML_TEMPLATE = Template(
    """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <title>{{ subject }}</title>
  <style>
    body { margin: 0; padding: 0; background: #eceef1; }
    a { text-decoration: none; }
    .story-link:hover { text-decoration: underline; }
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; }
      .pad { padding-left: 22px !important; padding-right: 22px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background:#eceef1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eceef1;">
    <tr>
      <td align="center" style="padding: 26px 12px;">
        <table role="presentation" class="container" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px; max-width:640px; background:#ffffff; border:1px solid #e0e3e8;">

          <!-- Masthead -->
          <tr>
            <td class="pad" style="background:#0b3d6b; padding: 30px 40px 26px;">
              <p style="margin:0 0 10px; font-family:{{ sans }}; font-size:11px; letter-spacing:3px; text-transform:uppercase; color:#8fb4d6; font-weight:700;">Weekly Brief &middot; {{ display_date }}</p>
              <h1 style="margin:0; font-family:{{ serif }}; font-size:30px; line-height:1.2; color:#ffffff; font-weight:700;">Hong Kong PPP Weekly Brief</h1>
              <p style="margin:12px 0 0; font-family:{{ cjk }}; font-size:14px; color:#c3d6e8;">香港公私營合作每週簡報</p>
            </td>
          </tr>

          <!-- Executive summary -->
          <tr>
            <td class="pad" style="padding: 30px 40px 8px;">
              <p style="margin:0 0 8px; font-family:{{ sans }}; font-size:11px; letter-spacing:2.5px; text-transform:uppercase; color:#075aaa; font-weight:700;">Executive Summary</p>
              <p style="margin:0; font-family:{{ serif }}; font-size:17px; line-height:1.6; color:#2b2f36;">{{ executive_summary }}</p>
            </td>
          </tr>

          {% for section in sections %}
          <!-- Section: {{ section }} -->
          <tr>
            <td class="pad" style="padding: 34px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:2px solid #0b3d6b; padding-top:14px;">
                  <h2 style="margin:0; font-family:{{ serif }}; font-size:20px; line-height:1.3; color:#0b3d6b; font-weight:700;">{{ section }}</h2>
                </td></tr>
              </table>
            </td>
          </tr>
          {% if grouped.get(section) %}
            {% for article in grouped[section] %}
          <tr>
            <td class="pad" style="padding: 22px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb; border-left:4px solid #075aaa; background:#ffffff;">
                <tr><td style="padding: 20px 22px;">
                  <p style="margin:0 0 6px; font-family:{{ serif }}; font-size:26px; line-height:1; color:#c7d3de; font-weight:700;">{{ '%02d'|format(loop.index) }}</p>
                  <h3 style="margin:0 0 6px; font-family:{{ serif }}; font-size:19px; line-height:1.35; font-weight:700;">
                    <a class="story-link" href="{{ article.url }}" style="color:#12283f;">{{ article.title_en or article.title }}</a>
                  </h3>
                  <p style="margin:0 0 14px; font-family:{{ sans }}; font-size:12px; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px;">{{ article.source }}{% if article.publish_date %} &middot; {{ article.publish_date }}{% endif %}</p>
                  <p style="margin:0 0 14px; font-family:{{ sans }}; font-size:15px; line-height:1.6; color:#2b2f36;">{{ article.summary_en }}</p>

                  {% if article.why_it_matters_en %}
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef4fb; border-left:3px solid #075aaa;">
                    <tr><td style="padding: 12px 16px;">
                      <p style="margin:0; font-family:{{ sans }}; font-size:14px; line-height:1.55; color:#334a60;"><span style="font-weight:700; color:#0b3d6b;">Why it matters &mdash;</span> {{ article.why_it_matters_en }}</p>
                    </td></tr>
                  </table>
                  {% endif %}

                  {% if article.title_zh or article.summary_zh %}
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px; border-top:1px solid #eef0f3;">
                    <tr><td style="padding-top:12px;">
                      {% if article.title_zh %}<p style="margin:0 0 6px; font-family:{{ cjk }}; font-size:15px; line-height:1.5; color:#3b4149; font-weight:700;">{{ article.title_zh }}</p>{% endif %}
                      {% if article.summary_zh %}<p style="margin:0 0 6px; font-family:{{ cjk }}; font-size:14px; line-height:1.7; color:#4f5b66;">{{ article.summary_zh }}</p>{% endif %}
                      {% if article.why_it_matters %}<p style="margin:0; font-family:{{ cjk }}; font-size:13px; line-height:1.7; color:#6b7280;"><span style="font-weight:700;">影響：</span>{{ article.why_it_matters }}</p>{% endif %}
                    </td></tr>
                  </table>
                  {% endif %}

                  <p style="margin:14px 0 0; font-family:{{ sans }}; font-size:13px; font-weight:700;"><a class="story-link" href="{{ article.url }}" style="color:#075aaa;">Read original &#8599;</a></p>
                </td></tr>
              </table>
            </td>
          </tr>
            {% endfor %}
          {% else %}
          <tr>
            <td class="pad" style="padding: 16px 40px 0;">
              <p style="margin:0; font-family:{{ sans }}; font-size:14px; color:#9aa1ac; font-style:italic;">No selected items this week.</p>
            </td>
          </tr>
          {% endif %}
          {% endfor %}

          <!-- Footer -->
          <tr>
            <td class="pad" style="padding: 34px 40px 30px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid #e5e7eb; padding-top:18px;">
                  <p style="margin:0 0 4px; font-family:{{ sans }}; font-size:12px; line-height:1.6; color:#9aa1ac;">Hong Kong PPP Weekly Brief &middot; automated draft, curated for infrastructure &amp; public-private partnership news.</p>
                  <p style="margin:0; font-family:{{ cjk }}; font-size:12px; line-height:1.6; color:#9aa1ac;">香港公私營合作每週簡報</p>
                </td></tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
)


def render_newsletter(articles: list[Article], output_dir: Path | None = None) -> tuple[str, str, Path]:
    issue_date = date.today().isoformat()
    display_date = date.today().strftime("%d %B %Y")
    subject = f"Hong Kong PPP Weekly Brief - {issue_date}"
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
        article.title_en or article.title
        for article in sorted(selected_articles, key=lambda item: item.relevance_score, reverse=True)[:3]
    ]
    executive_summary = (
        "This week's brief covers Hong Kong public-private partnership, infrastructure, "
        "and public-works developments. "
        + ("Top stories: " + "; ".join(top_titles) + "." if top_titles else "No high-confidence items were selected this week.")
    )
    html = HTML_TEMPLATE.render(
        subject=subject,
        display_date=display_date,
        executive_summary=executive_summary,
        sections=SECTIONS,
        grouped=grouped,
        serif=SERIF,
        sans=SANS,
        cjk=CJK,
    )
    output_dir = output_dir or Path(".newsletter_data")
    output_dir.mkdir(exist_ok=True)
    html_path = output_dir / f"newsletter-{issue_date}.html"
    html_path.write_text(html, encoding="utf-8")
    return subject, html, html_path
