from datetime import date, timedelta

from newsletter.models import Article
from newsletter.scoring import (
    dedupe_articles,
    is_low_value,
    is_recent,
    keyword_matches,
    score_article,
)


def test_keyword_matching_works_for_english_and_traditional_chinese():
    text = "Northern Metropolis public private partnership 公私營合作 基建融資"
    matches = keyword_matches(text)
    assert "Northern Metropolis" in matches
    assert "public private partnership" in matches
    assert "公私營合作" in matches
    assert "基建融資" in matches


def test_dedupe_articles_merges_tracking_urls_and_similar_titles():
    articles = [
        Article(title="Hong Kong launches Northern Metropolis PPP plan", url="https://example.com/a?utm_source=x", source="A"),
        Article(title="Hong Kong launches Northern Metropolis PPP plan", url="https://example.com/a", source="B"),
        Article(title="Unrelated market story", url="https://example.com/b", source="C"),
    ]
    deduped = dedupe_articles(articles)
    assert len(deduped) == 2


def test_scoring_ranks_relevant_hong_kong_ppp_story_higher():
    relevant = Article(
        title="Hong Kong public private partnership planned for transport infrastructure",
        url="https://example.com/ppp",
        source="Development Bureau",
        excerpt="Northern Metropolis public works and project finance update.",
    )
    unrelated = Article(
        title="Restaurant group announces new menu",
        url="https://example.com/food",
        source="Media",
        excerpt="Consumer lifestyle update.",
    )
    assert score_article(relevant) > score_article(unrelated)


def test_low_value_pages_are_excluded_by_scoring():
    tv_series = Article(
        title="Urban Renewal TV Series",
        url="https://www.ura.org.hk/en/news-centre/urban-renewal-tv-series",
        source="Urban Renewal Authority",
        excerpt="Urban renewal public private partnership 公私營合作",
    )
    assert is_low_value(tv_series)
    # Despite matching PPP keywords, low-value pages score 0 (below threshold).
    assert score_article(tv_series) == 0


def test_is_recent_filters_old_dated_items_but_keeps_dateless():
    old = Article(title="Old", url="u", source="s", publish_date="2026-01-28")
    fresh = Article(
        title="Fresh",
        url="u",
        source="s",
        publish_date=(date.today() - timedelta(days=5)).isoformat(),
    )
    dateless = Article(title="No date", url="u", source="s", publish_date="")
    assert not is_recent(old, 30)
    assert is_recent(fresh, 30)
    assert is_recent(dateless, 30)  # kept when date is unknown

