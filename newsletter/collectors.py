from __future__ import annotations

from datetime import UTC, datetime
from html.parser import HTMLParser
from html import unescape
import re
from xml.etree import ElementTree
from urllib.parse import urljoin

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


def clean_text(value: str) -> str:
    without_tags = re.sub(r"<[^>]+>", " ", value or "")
    return " ".join(unescape(without_tags).split())


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


def fetch_html_index(source: Source, limit: int) -> list[Article]:
    response = requests.get(source.url, headers=HEADERS, timeout=25)
    response.raise_for_status()
    parser = LinkExtractor()
    parser.feed(response.text)
    articles: list[Article] = []
    for href, title in parser.links:
        href = href.strip()
        if len(title) < 12 or href.startswith(("mailto:", "javascript:")):
            continue
        lowered = title.lower()
        if lowered in {"home", "contact us", "privacy policy", "important notices"}:
            continue
        url = urljoin(source.url, href)
        excerpt = title[:500]
        articles.append(Article(title=title[:240], url=url, source=source.name, excerpt=excerpt))
    scored = []
    for article in articles:
        article.relevance_score = score_article(article)
        article.category = categorize(article)
        scored.append(article)
    return sorted(scored, key=lambda item: item.relevance_score, reverse=True)[:limit]


def collect_from_source(source: Source, limit: int = 25) -> list[Article]:
    if not source.enabled:
        return []
    if source.source_type.lower() == "rss" or source.url.lower().endswith((".xml", "/feed")):
        articles = fetch_rss(source, limit)
    else:
        articles = fetch_html_index(source, limit)
    collected_at = datetime.now(UTC).date().isoformat()
    for article in articles:
        if not article.publish_date:
            article.publish_date = collected_at
        if article.relevance_score == 0:
            article.relevance_score = score_article(article)
        if not article.category:
            article.category = categorize(article)
        article.status = "selected" if article.relevance_score >= 10 else "rejected"
    return articles
