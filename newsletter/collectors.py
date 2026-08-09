from __future__ import annotations

from datetime import UTC, datetime
from html.parser import HTMLParser
from html import unescape
import re
from xml.etree import ElementTree
from urllib.parse import urljoin, urlsplit

import requests
from dateutil import parser as date_parser

from .models import Article, Source
from .scoring import categorize, score_article


HEADERS = {
    "User-Agent": "HongKongPPPNewsletterBot/0.1 (+review-first educational newsletter; contact site owner if unwanted)"
}


def parse_date(value: str | None) -> str:
    if not value:
        return ""
    try:
        return date_parser.parse(value).date().isoformat()
    except (ValueError, TypeError, OverflowError):
        return ""


def fix_mojibake(value: str) -> str:
    """Repair UTF-8 text that was mis-decoded as ISO-8859-1 and re-encoded.

    Government pages that serve UTF-8 without a charset header get decoded by
    ``requests`` as ISO-8859-1. This turns Latin punctuation (``’`` -> ``â€™``)
    *and* CJK (``跳`` -> ``è·³``) into garbage. Re-encoding as latin-1 and
    decoding as UTF-8 reverses it.

    The gate is "any Latin-1 supplement char (U+0080-U+00FF)". The strict
    round-trip is self-protecting: genuinely-encoded text (a lone ``é`` in
    "café", or real CJK above U+00FF) either fails to re-encode/decode or is
    unchanged, so it is returned untouched.
    """
    if not value or not any(0x80 <= ord(ch) <= 0xFF for ch in value):
        return value
    try:
        repaired = value.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return value
    # Reject if the round-trip produced replacement noise or did nothing.
    if "�" in repaired or repaired == value:
        return value
    return repaired


def clean_text(value: str) -> str:
    without_tags = re.sub(r"<[^>]+>", " ", value or "")
    # Repair mojibake BEFORE collapsing whitespace: str.split() treats bytes
    # like 0x85 (NEL) as whitespace and would otherwise shred a multibyte
    # character mid-sequence, making it unrepairable.
    repaired = fix_mojibake(unescape(without_tags))
    return " ".join(repaired.split())


# --- Junk / navigation link filtering -------------------------------------

JUNK_EXTENSIONS = (
    ".mp4", ".mov", ".avi", ".wmv", ".mp3", ".m4a", ".wav",
    ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp",
    ".zip", ".rar", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".css", ".js", ".ico", ".rss", ".xml",
)

JUNK_URL_SEGMENTS = ("/video/", "/videos/", "/banner/", "/banners/", "/rss", "/sitemap")

# Navigation / accessibility / boilerplate link text (lower-cased, exact match).
NAV_TITLES = {
    "home", "contact us", "privacy policy", "important notices",
    "sitemap", "site map", "site guide", "back to top", "skip to main content",
    "skip to content", "accessibility", "terms of use", "disclaimer",
    "english", "eng", "繁體", "繁體版", "简体", "簡體", "简体版",
    "跳至主要內容", "跳至主要内容", "網站指南", "网站指南", "無障礙", "无障碍",
    "私隱政策", "私隠政策", "版權公告", "重要告示",
}


def is_garbled(text: str) -> bool:
    """True for text that is still broken mojibake after repair attempts.

    Legitimate titles here are English (ASCII) or Traditional Chinese
    (code points > U+00FF). A residual Latin-1 supplement char (U+0080-U+00FF)
    means the text is unrepairable mojibake (e.g. corrupted before storage).
    Accented-Latin titles are effectively absent in this HK gov/PPP domain, so
    the tradeoff is safe.
    """
    return any(0x80 <= ord(ch) <= 0xFF for ch in fix_mojibake(text or ""))


def is_junk_url(url: str) -> bool:
    """True for links that are not readable articles (media, docs, feeds)."""
    lowered = url.lower()
    path = urlsplit(lowered).path
    if path.endswith(JUNK_EXTENSIONS):
        return True
    return any(segment in lowered for segment in JUNK_URL_SEGMENTS)


def is_junk_link(href: str, title: str) -> bool:
    """True for non-article links: bad schemes, media/doc files, or nav text."""
    lowered_href = href.strip().lower()
    if lowered_href.startswith(("mailto:", "javascript:", "tel:", "#")):
        return True
    if is_junk_url(href):
        return True
    return title.strip().lower() in NAV_TITLES


# --- Publish-date extraction ----------------------------------------------

_MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec"
_TITLE_DATE_RE = re.compile(rf"\b(\d{{1,2}}\s+(?:{_MONTHS})[a-z]*\s+20\d\d)\b", re.IGNORECASE)
_URL_DATE_COMPACT_RE = re.compile(r"/(20\d\d)(\d{2})(\d{2})(?:\b|/|\.)")
_URL_DATE_SLASH_RE = re.compile(r"/(20\d\d)/(\d{2})/(\d{2})/")
# gov.hk press-release style: /202606/19/ (YYYYMM/DD)
_URL_DATE_YM_D_RE = re.compile(r"/(20\d\d)(\d{2})/(\d{2})/")


def extract_publish_date(title: str, url: str) -> str:
    """Recover a real publish date from a title prefix or URL slug.

    Government listing links embed the date in the link text ("28 Mar 2026 …")
    or the URL (``/press-releases/20260530``, ``/202606/19/…``). Returns an
    ISO date string, or "" when none is found.
    """
    match = _TITLE_DATE_RE.search(title or "")
    if match:
        parsed = parse_date(match.group(1))
        if parsed:
            return parsed
    for regex in (_URL_DATE_COMPACT_RE, _URL_DATE_SLASH_RE, _URL_DATE_YM_D_RE):
        match = regex.search(url or "")
        if match:
            year, month, day = match.group(1), match.group(2), match.group(3)
            parsed = parse_date(f"{year}-{month}-{day}")
            if parsed:
                return parsed
    return ""


class LinkExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "a":
            attrs_dict = dict(attrs)
            self._href = attrs_dict.get("href")
            self._text = []

    def handle_data(self, data: str) -> None:
        if self._href:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "a" and self._href:
            self.links.append((self._href, clean_text(" ".join(self._text))))
            self._href = None
            self._text = []


def fetch_rss(source: Source, limit: int) -> list[Article]:
    response = requests.get(source.url, headers=HEADERS, timeout=25)
    response.raise_for_status()
    root = ElementTree.fromstring(response.content)
    articles: list[Article] = []
    items = root.findall(".//item")
    if not items:
        items = root.findall(".//{http://www.w3.org/2005/Atom}entry")
    for entry in items[:limit]:
        title_node = entry.find("title") or entry.find("{http://www.w3.org/2005/Atom}title")
        link_node = entry.find("link") or entry.find("{http://www.w3.org/2005/Atom}link")
        summary_node = (
            entry.find("description")
            or entry.find("summary")
            or entry.find("{http://www.w3.org/2005/Atom}summary")
        )
        date_node = (
            entry.find("pubDate")
            or entry.find("published")
            or entry.find("{http://www.w3.org/2005/Atom}published")
            or entry.find("{http://www.w3.org/2005/Atom}updated")
        )
        title = clean_text(title_node.text if title_node is not None else "")
        link = ""
        if link_node is not None:
            link = link_node.text or link_node.attrib.get("href", "")
        excerpt = clean_text(summary_node.text if summary_node is not None else "")
        publish_date = parse_date(date_node.text if date_node is not None else "")
        if title and link:
            articles.append(Article(title=title, url=link, source=source.name, publish_date=publish_date, excerpt=excerpt))
    return articles


def fetch_html_index(source: Source, limit: int, keywords: list[str] | None = None) -> list[Article]:
    response = requests.get(source.url, headers=HEADERS, timeout=25)
    response.raise_for_status()
    # requests defaults charset-less text/html to ISO-8859-1, which mangles
    # UTF-8 pages. Prefer the content-sniffed encoding instead.
    response.encoding = response.apparent_encoding or response.encoding
    parser = LinkExtractor()
    parser.feed(response.text)
    articles: list[Article] = []
    for href, title in parser.links:
        href = href.strip()
        if len(title) < 12 or is_junk_link(href, title):
            continue
        url = urljoin(source.url, href)
        if is_junk_url(url):
            continue
        excerpt = title[:500]
        publish_date = extract_publish_date(title, url)
        articles.append(
            Article(title=title[:240], url=url, source=source.name, excerpt=excerpt, publish_date=publish_date)
        )
    scored = []
    for article in articles:
        article.relevance_score = score_article(article, keywords)
        article.category = categorize(article)
        scored.append(article)
    return sorted(scored, key=lambda item: item.relevance_score, reverse=True)[:limit]


def collect_from_source(source: Source, limit: int = 25, keywords: list[str] | None = None) -> list[Article]:
    if not source.enabled:
        return []
    if source.source_type.lower() == "rss" or source.url.lower().endswith((".xml", "/feed")):
        articles = fetch_rss(source, limit)
    else:
        articles = fetch_html_index(source, limit, keywords)
    collected_at = datetime.now(UTC).date().isoformat()
    for article in articles:
        if not article.publish_date:
            article.publish_date = collected_at
        if article.relevance_score == 0:
            article.relevance_score = score_article(article, keywords)
        if not article.category:
            article.category = categorize(article)
        article.status = "selected" if article.relevance_score >= 10 else "rejected"
    return articles
