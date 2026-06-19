from __future__ import annotations

import re
from difflib import SequenceMatcher
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from .config import DEFAULT_KEYWORDS
from .models import Article


TRACKING_PREFIXES = ("utm_",)
TRACKING_KEYS = {"fbclid", "gclid", "mc_cid", "mc_eid"}


def normalize_url(url: str) -> str:
    parts = urlsplit(url.strip())
    query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key not in TRACKING_KEYS and not key.startswith(TRACKING_PREFIXES)
    ]
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, urlencode(query), ""))


def normalize_title(title: str) -> str:
    return re.sub(r"\W+", " ", title.lower()).strip()


def keyword_matches(text: str, keywords: list[str] | None = None) -> list[str]:
    haystack = text.lower()
    matches = []
    for keyword in keywords or DEFAULT_KEYWORDS:
        needle = keyword.lower()
        if re.search(rf"\b{re.escape(needle)}\b", haystack) if needle.isascii() else needle in text:
            matches.append(keyword)
    return matches


def score_article(article: Article, keywords: list[str] | None = None) -> int:
    text = f"{article.title}\n{article.excerpt}"
    matches = keyword_matches(text, keywords)
    score = len(matches) * 10
    title_matches = keyword_matches(article.title, keywords)
    score += len(title_matches) * 8
    if "Hong Kong" in text or "香港" in text:
        score += 8
    if article.source.lower().endswith(("bureau", "department")) or "government" in article.source.lower():
        score += 3
    return score


def categorize(article: Article) -> str:
    text = f"{article.title} {article.excerpt}".lower()
    if any(term in text for term in ["legco", "gazette", "policy", "regulation", "ordinance", "consultation"]):
        return "Policy & Regulatory Watch"
    if any(term in text for term in ["project", "works", "rail", "road", "metropolis", "technopole", "urban renewal"]):
        return "Project Pipeline"
    if any(term in text for term in ["finance", "fund", "investment", "ipo", "bond"]):
        return "Market/Finance Notes"
    return "Top Hong Kong PPP/Infrastructure Updates"


def dedupe_articles(articles: list[Article]) -> list[Article]:
    kept: list[Article] = []
    seen_urls: set[str] = set()
    for article in articles:
        normalized_url = normalize_url(article.url)
        normalized_title = normalize_title(article.title)
        if normalized_url in seen_urls:
            continue
        duplicate = False
        for existing in kept:
            ratio = SequenceMatcher(None, normalized_title, normalize_title(existing.title)).ratio()
            if ratio >= 0.92:
                duplicate = True
                break
        if duplicate:
            continue
        seen_urls.add(normalized_url)
        kept.append(article)
    return kept

