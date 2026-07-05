from __future__ import annotations

import json

import requests

from .config import Settings
from .models import Article


FALLBACK_SUMMARY_ZH = "請在發送前由編輯補充中文摘要。"
FALLBACK_WHY_IT_MATTERS = "可能與香港公私營合作、基建、採購或公共工程發展相關。"
LEGACY_FALLBACK_WHY_IT_MATTERS = (
    "Potentially relevant to Hong Kong PPP, infrastructure, procurement, or public works developments."
)


def needs_ai_summary(article: Article) -> bool:
    return (
        article.status in {"selected", "new"}
        or not article.summary_zh.strip()
        or article.summary_zh.strip() == FALLBACK_SUMMARY_ZH
        or article.why_it_matters.strip() in {FALLBACK_WHY_IT_MATTERS, LEGACY_FALLBACK_WHY_IT_MATTERS}
    )


def fallback_summary(article: Article) -> Article:
    base = article.excerpt or article.title
    trimmed = base[:260]
    article.title_en = article.title_en or article.title
    article.title_zh = article.title_zh or article.title
    article.summary_en = trimmed
    article.summary_zh = FALLBACK_SUMMARY_ZH
    article.why_it_matters = FALLBACK_WHY_IT_MATTERS
    article.why_it_matters_en = (
        "Potentially relevant to Hong Kong public-private partnership, "
        "infrastructure, procurement, or public works developments."
    )
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
                        "Return strict JSON with title_en, summary_en, why_it_matters_en, title_zh_hant, summary_zh_hant, and why_it_matters_zh_hant. "
                        "title_en is a clean, concise English headline (fix any garbled characters or truncation in the source title). "
                        "Use Traditional Chinese as used in Hong Kong for title_zh_hant, summary_zh_hant, and why_it_matters_zh_hant. "
                        "Make title_zh_hant a concise display headline, not a literal full-title translation. "
                        "If the original title is long, summarize it so it fits about 3-4 visual lines in a three-column newsletter card: "
                        "aim for 34-42 Traditional Chinese characters, or 12-16 English words only when English must be retained. "
                        "Do not invent facts beyond the provided metadata/excerpt."
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
    article.title_en = str(data.get("title_en", "")).strip() or article.title
    article.title_zh = str(data.get("title_zh_hant", "")).strip()
    article.summary_en = str(data.get("summary_en", "")).strip()
    article.summary_zh = str(data.get("summary_zh_hant", "")).strip()
    article.why_it_matters = str(data.get("why_it_matters_zh_hant", "")).strip()
    article.why_it_matters_en = str(data.get("why_it_matters_en", "")).strip()
    article.status = "summarized"
    return article
