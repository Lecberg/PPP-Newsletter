from __future__ import annotations

import json

import requests

from .config import Settings
from .models import Article


def fallback_summary(article: Article) -> Article:
    base = article.excerpt or article.title
    trimmed = base[:260]
    article.summary_en = trimmed
    article.summary_zh = "請在發送前由編輯補充中文摘要。"
    article.why_it_matters = "Potentially relevant to Hong Kong PPP, infrastructure, procurement, or public works developments."
    article.status = "summarized"
    return article


def summarize_article(article: Article, settings: Settings) -> Article:
    if not settings.openai_api_key:
        return fallback_summary(article)

    prompt = {
        "title": article.title,
        "source": article.source,
        "date": article.publish_date,
        "excerpt": article.excerpt[:1200],
        "url": article.url,
    }
    response = requests.post(
        f"{settings.openai_base_url}/chat/completions",
        headers={
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": settings.openai_model,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You summarize public-private partnership and infrastructure news for a professional Hong Kong newsletter. "
                        "Return strict JSON with summary_en, summary_zh_hant, and why_it_matters. "
                        "Use Traditional Chinese for summary_zh_hant. Do not invent facts beyond the provided metadata/excerpt."
                    ),
                },
                {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
            ],
        },
        timeout=45,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    data = json.loads(content)
    article.summary_en = str(data.get("summary_en", "")).strip()
    article.summary_zh = str(data.get("summary_zh_hant", "")).strip()
    article.why_it_matters = str(data.get("why_it_matters", "")).strip()
    article.status = "summarized"
    return article

