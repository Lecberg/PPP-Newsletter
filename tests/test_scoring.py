from newsletter.models import Article
from newsletter.scoring import dedupe_articles, keyword_matches, score_article


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

