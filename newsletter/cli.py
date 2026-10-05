from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone

from .ai import needs_ai_summary, summarize_article
from .brevo import brevo_config_issues, create_draft_campaign
from .collectors import collect_from_source, is_garbled, is_junk_link
from .config import get_settings, parse_keywords
from .models import Article
from .render import EXCLUDED_SECTIONS, SECTIONS, render_newsletter
from .schedule import Schedule
from .scoring import dedupe_articles, is_low_value
from .storage import get_store


DEFAULT_LIMIT_PER_SOURCE = 100
DEFAULT_MAX_ITEMS = 30
DEFAULT_LOOKBACK_DAYS = 31
MIN_RELEVANCE_SCORE = 10


def collect(limit_per_source: int = DEFAULT_LIMIT_PER_SOURCE, *, settings=None, store=None) -> list[Article]:
    settings = settings or get_settings()
    store = store or get_store(settings)
    keywords = parse_keywords(store.read_config().get("keywords"))
    collected: list[Article] = []
    for source in store.read_sources():
        try:
            collected.extend(collect_from_source(source, limit=limit_per_source, keywords=keywords))
        except Exception as exc:
            print(f"[warn] source failed: {source.name}: {exc}")
    existing = store.read_articles()
    merged = dedupe_articles(existing + collected)
    store.write_articles(merged)
    print(f"Collected {len(collected)} articles; stored {len(merged)} deduplicated articles.")
    return merged


def generate(max_items: int = DEFAULT_MAX_ITEMS, lookback_days: int = DEFAULT_LOOKBACK_DAYS, *, settings=None, store=None, issue_day: date | None = None) -> tuple[str, str, str]:
    settings = settings or get_settings()
    store = store or get_store(settings)
    articles = store.read_articles()
    eligible = [
        article
        for article in articles
        if _is_newsletter_candidate(article, lookback_days=lookback_days, min_score=MIN_RELEVANCE_SCORE)
    ]
    selected = sorted(eligible, key=lambda item: item.relevance_score, reverse=True)[:max_items]
    to_summarize = [article for article in selected if needs_ai_summary(article)]
    summarized_urls = {article.url for article in to_summarize}
    summarized = [summarize_article(article, settings) for article in to_summarize]
    summarized_by_url = {article.url: article for article in summarized}
    draft_articles = [summarized_by_url.get(article.url, article) for article in selected]
    updated = []
    for article in articles:
        updated.append(summarized_by_url.get(article.url, article))
    store.write_articles(updated)
    subject, html, html_path = render_newsletter(draft_articles, settings.local_data_dir, issue_day)
    store.append_issue(
        {
            "issue_date": (issue_day or date.today()).isoformat(),
            "newsletter_subject": subject,
            "brevo_campaign_id": "",
            "approval_status": "draft_created",
            "html_path": str(html_path),
        }
    )
    if len(draft_articles) < max_items:
        print(
            f"[warn] only {len(draft_articles)} eligible articles found in the last {lookback_days} days "
            f"(requested {max_items})."
        )
    print(f"Generated newsletter draft with {len(draft_articles)} articles; refreshed {len(summarized_urls)} summaries: {html_path}")
    return subject, html, str(html_path)


def create_campaign(max_items: int = DEFAULT_MAX_ITEMS, lookback_days: int = DEFAULT_LOOKBACK_DAYS, *, settings=None, store=None, issue_day: date | None = None) -> str:
    settings = settings or get_settings()
    store = store or get_store(settings)
    articles = [
        article
        for article in store.read_articles()
        if article.status == "summarized"
        and _is_newsletter_candidate(article, lookback_days=lookback_days, min_score=MIN_RELEVANCE_SCORE)
    ]
    articles = sorted(articles, key=lambda item: item.relevance_score, reverse=True)
    subject, html, html_path = render_newsletter(articles[:max_items], settings.local_data_dir, issue_day)
    campaign_id = create_draft_campaign(settings, subject, html)
    store.append_issue(
        {
            "issue_date": (issue_day or date.today()).isoformat(),
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


def run_weekly(
    limit_per_source: int = DEFAULT_LIMIT_PER_SOURCE,
    max_items: int = DEFAULT_MAX_ITEMS,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
) -> None:
    settings = get_settings()
    store = get_store(settings)
    config, sources = store.draft_settings_snapshot() if hasattr(store, "draft_settings_snapshot") else (store.read_config(), store.read_sources())
    from .drafting import SnapshotStore
    snapshot = SnapshotStore(store, config, sources)
    issue_day = datetime.now(timezone.utc).astimezone(Schedule.from_config(config).tzinfo()).date()
    collect(limit_per_source=limit_per_source, settings=settings, store=snapshot)
    generate(max_items=max_items, lookback_days=lookback_days, settings=settings, store=snapshot, issue_day=issue_day)
    create_campaign(max_items=max_items, lookback_days=lookback_days, settings=settings, store=snapshot, issue_day=issue_day)


def run_scheduled(
    limit_per_source: int = DEFAULT_LIMIT_PER_SOURCE,
    max_items: int = DEFAULT_MAX_ITEMS,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    now: datetime | None = None,
) -> bool:
    """Run the pipeline only if the current time matches the client's schedule.

    Intended to be invoked hourly by the scheduler (e.g. GitHub Actions). Returns
    True if the pipeline ran, False if it was skipped.
    """
    settings = get_settings()
    store = get_store(settings)
    config = store.read_config()
    if str(config.get("automatic_drafting_enabled", "")).strip().lower() not in {"true", "yes", "1", "enabled"}:
        print("[skip] automatic drafting is off.")
        return False
    schedule = Schedule.from_config(config)
    now = now or datetime.now(timezone.utc)

    if not schedule.matches(now):
        local = now.astimezone(schedule.tzinfo())
        print(
            f"[skip] {local:%Y-%m-%d %H:%M %Z} is outside the delivery slot "
            f"({schedule.describe()})."
        )
        return False

    if _already_ran_today(store, now.astimezone(schedule.tzinfo())):
        print("[skip] an issue was already created today; not drafting again.")
        return False

    print(f"[run] delivery slot matched ({schedule.describe()}); running pipeline.")
    run_weekly(
        limit_per_source=limit_per_source,
        max_items=max_items,
        lookback_days=lookback_days,
    )
    return True


def _already_ran_today(store, now: datetime) -> bool:
    today = now.date().isoformat()
    try:
        issues = store.read_issues()
    except Exception as exc:
        raise RuntimeError("Issue history could not be checked. Drafting stopped to avoid duplicates.") from exc
    return any(str(issue.get("issue_date", "")).strip() == today and str(issue.get("brevo_campaign_id", "")).isdigit() and int(str(issue["brevo_campaign_id"])) > 0 for issue in issues)


def _is_newsletter_candidate(
    article: Article,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    min_score: int = MIN_RELEVANCE_SCORE,
) -> bool:
    return (
        article.status in {"selected", "new", "summarized", "rejected"}
        and article.relevance_score >= min_score
        and article.category in SECTIONS
        and article.category not in EXCLUDED_SECTIONS
        and not is_low_value(article)
        and not is_junk_link(article.url, article.title)
        and not is_garbled(article.title)
        and _is_within_lookback(article, lookback_days=lookback_days)
    )


def _is_within_lookback(article: Article, lookback_days: int = DEFAULT_LOOKBACK_DAYS) -> bool:
    if lookback_days <= 0 or not article.publish_date:
        return True
    try:
        published = date.fromisoformat(article.publish_date)
    except ValueError:
        return True
    return published >= date.today() - timedelta(days=lookback_days)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Hong Kong PPP newsletter automation")
    subparsers = parser.add_subparsers(dest="command", required=True)
    collect_parser = subparsers.add_parser("collect")
    collect_parser.add_argument("--limit-per-source", type=int, default=DEFAULT_LIMIT_PER_SOURCE)
    generate_parser = subparsers.add_parser("generate")
    generate_parser.add_argument("--max-items", type=int, default=DEFAULT_MAX_ITEMS)
    generate_parser.add_argument("--lookback-days", type=int, default=DEFAULT_LOOKBACK_DAYS)
    campaign_parser = subparsers.add_parser("create-campaign")
    campaign_parser.add_argument("--max-items", type=int, default=DEFAULT_MAX_ITEMS)
    campaign_parser.add_argument("--lookback-days", type=int, default=DEFAULT_LOOKBACK_DAYS)
    run_parser = subparsers.add_parser("run-weekly")
    run_parser.add_argument("--limit-per-source", type=int, default=DEFAULT_LIMIT_PER_SOURCE)
    run_parser.add_argument("--max-items", type=int, default=DEFAULT_MAX_ITEMS)
    run_parser.add_argument("--lookback-days", type=int, default=DEFAULT_LOOKBACK_DAYS)
    monthly_parser = subparsers.add_parser("run-monthly")
    monthly_parser.add_argument("--limit-per-source", type=int, default=DEFAULT_LIMIT_PER_SOURCE)
    monthly_parser.add_argument("--max-items", type=int, default=DEFAULT_MAX_ITEMS)
    monthly_parser.add_argument("--lookback-days", type=int, default=DEFAULT_LOOKBACK_DAYS)
    scheduled_parser = subparsers.add_parser(
        "run-scheduled",
        help="Run the pipeline only if the current time matches the Config-tab schedule.",
    )
    scheduled_parser.add_argument("--limit-per-source", type=int, default=DEFAULT_LIMIT_PER_SOURCE)
    scheduled_parser.add_argument("--max-items", type=int, default=DEFAULT_MAX_ITEMS)
    scheduled_parser.add_argument("--lookback-days", type=int, default=DEFAULT_LOOKBACK_DAYS)
    args = parser.parse_args(argv)

    if args.command == "collect":
        collect(args.limit_per_source)
    elif args.command == "generate":
        generate(args.max_items, args.lookback_days)
    elif args.command == "create-campaign":
        create_campaign(args.max_items, args.lookback_days)
    elif args.command in {"run-weekly", "run-monthly"}:
        run_weekly(args.limit_per_source, args.max_items, args.lookback_days)
    elif args.command == "run-scheduled":
        run_scheduled(args.limit_per_source, args.max_items, args.lookback_days)
    return 0
