from __future__ import annotations

import argparse
from datetime import date

from .ai import summarize_article
from .brevo import brevo_config_issues, create_draft_campaign
from .collectors import collect_from_source
from .config import get_settings
from .models import Article
from .render import render_newsletter
from .scoring import dedupe_articles
from .storage import get_store


def collect(limit_per_source: int = 25) -> list[Article]:
    settings = get_settings()
    store = get_store(settings)
    collected: list[Article] = []
    for source in store.read_sources():
        try:
            collected.extend(collect_from_source(source, limit=limit_per_source))
        except Exception as exc:
            print(f"[warn] source failed: {source.name}: {exc}")
    existing = store.read_articles()
    merged = dedupe_articles(existing + collected)
    store.write_articles(merged)
    print(f"Collected {len(collected)} articles; stored {len(merged)} deduplicated articles.")
    return merged


def generate(max_items: int = 12) -> tuple[str, str, str]:
    settings = get_settings()
    store = get_store(settings)
    articles = store.read_articles()
    selected = [
        article
        for article in articles
        if article.status in {"selected", "new"} and article.relevance_score >= 10
    ]
    selected = sorted(selected, key=lambda item: item.relevance_score, reverse=True)[:max_items]
    summarized_urls = {article.url for article in selected}
    summarized = [summarize_article(article, settings) for article in selected]
    updated = []
    for article in articles:
        replacement = next((item for item in summarized if item.url == article.url), None)
        updated.append(replacement or article)
    store.write_articles(updated)
    subject, html, html_path = render_newsletter(summarized, settings.local_data_dir)
    store.append_issue(
        {
            "issue_date": date.today().isoformat(),
            "newsletter_subject": subject,
            "brevo_campaign_id": "",
            "approval_status": "draft_created",
            "html_path": str(html_path),
        }
    )
    print(f"Generated newsletter draft with {len(summarized_urls)} articles: {html_path}")
    return subject, html, str(html_path)


def create_campaign() -> str:
    settings = get_settings()
    store = get_store(settings)
    articles = [article for article in store.read_articles() if article.status == "summarized"]
    subject, html, html_path = render_newsletter(articles[:12], settings.local_data_dir)
    campaign_id = create_draft_campaign(settings, subject, html)
    store.append_issue(
        {
            "issue_date": date.today().isoformat(),
            "newsletter_subject": subject,
            "brevo_campaign_id": campaign_id,
            "approval_status": "draft_created",
            "html_path": str(html_path),
        }
    )
    if campaign_id:
        print(f"Created Brevo draft campaign {campaign_id}.")
    else:
        issues = brevo_config_issues(settings)
        details = "; ".join(issues) if issues else "campaign was not created"
        print(f"Brevo draft not created ({details}); saved draft only: {html_path}")
    return campaign_id


def run_weekly() -> None:
    collect()
    generate()
    create_campaign()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Hong Kong PPP newsletter automation")
    subparsers = parser.add_subparsers(dest="command", required=True)
    collect_parser = subparsers.add_parser("collect")
    collect_parser.add_argument("--limit-per-source", type=int, default=25)
    generate_parser = subparsers.add_parser("generate")
    generate_parser.add_argument("--max-items", type=int, default=12)
    subparsers.add_parser("create-campaign")
    subparsers.add_parser("run-weekly")
    args = parser.parse_args(argv)

    if args.command == "collect":
        collect(args.limit_per_source)
    elif args.command == "generate":
        generate(args.max_items)
    elif args.command == "create-campaign":
        create_campaign()
    elif args.command == "run-weekly":
        run_weekly()
    return 0
