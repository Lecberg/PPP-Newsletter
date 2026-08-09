from newsletter import cli
from newsletter.config import DEFAULT_KEYWORDS, parse_keywords
from newsletter.models import Article, Source
from newsletter.scoring import score_article


def test_parse_keywords_splits_on_newlines_and_commas():
    assert parse_keywords("desalination\nsmart city") == ["desalination", "smart city"]
    assert parse_keywords("desalination, smart city") == ["desalination", "smart city"]
    # Full-width comma, for a bilingual client editing the cell.
    assert parse_keywords("海水淡化，智慧城市") == ["海水淡化", "智慧城市"]
    # Blank/whitespace-only entries are dropped.
    assert parse_keywords("a\n\n  \nb") == ["a", "b"]


def test_parse_keywords_falls_back_to_defaults_when_empty():
    assert parse_keywords("") == list(DEFAULT_KEYWORDS)
    assert parse_keywords(None) == list(DEFAULT_KEYWORDS)
    assert parse_keywords("   ") == list(DEFAULT_KEYWORDS)


def test_client_keyword_lifts_a_story_over_the_selection_threshold():
    article = Article(
        title="New desalination plant approved in Hong Kong",
        url="https://example.com/desal",
        source="Test Source",  # neutral source, so we isolate the keyword effect
        excerpt="desalination capacity expansion",
    )
    # Not a default keyword -> below the score-10 selection threshold.
    assert score_article(article) < 10
    # Client adds it in the Config tab -> now clears the threshold.
    assert score_article(article, parse_keywords("desalination")) >= 10


class FakeStore:
    def __init__(self, config, sources):
        self.config = config
        self.sources = sources

    def read_config(self):
        return self.config

    def read_sources(self):
        return self.sources

    def read_articles(self):
        return []

    def write_articles(self, articles):
        self.written = list(articles)


def test_collect_threads_config_keywords_into_collection(monkeypatch):
    source = Source(name="Test", url="https://example.com", source_type="official_html")
    store = FakeStore(config={"keywords": "desalination\nsmart city"}, sources=[source])
    captured = {}

    def fake_collect_from_source(src, limit, keywords=None):
        captured["keywords"] = keywords
        return []

    monkeypatch.setattr(cli, "get_settings", lambda: object())
    monkeypatch.setattr(cli, "get_store", lambda settings: store)
    monkeypatch.setattr(cli, "collect_from_source", fake_collect_from_source)

    cli.collect()

    assert captured["keywords"] == ["desalination", "smart city"]
