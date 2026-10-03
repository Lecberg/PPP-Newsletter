# Hong Kong PPP Weekly Newsletter MVP

This project collects Hong Kong public-private partnership and infrastructure news, filters and deduplicates articles, generates an English + Traditional Chinese newsletter draft with an OpenAI-compatible API, stores workflow data in Google Sheets, and creates a draft Brevo campaign for human review.

The system never auto-sends email. A reviewer confirms delivery in the private
portal or sends the campaign inside Brevo.

The new [private portal](portal/README.md) lets the owner and one client review drafts,
manage newsletter recipients, and approve immediate delivery through Brevo.
It lives in `portal/` and deploys separately on Vercel. Google Sheets still controls
sources, keywords, and draft scheduling. Portal delivery stays disabled until setup
and a controlled test delivery are complete.

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .[dev]
copy .env.example .env
```

Set the environment variables in `.env`, or configure them as GitHub Actions secrets.

## Commands

```powershell
python -m newsletter collect
python -m newsletter generate
python -m newsletter create-campaign
python -m newsletter run-weekly
python -m newsletter run-scheduled
```

`run-scheduled` runs the full pipeline **only if** the current time matches the
delivery slot configured in the `Config` tab (see below). The GitHub Actions
workflow fires hourly and calls `run-scheduled`, so the client controls timing
from the spreadsheet without any code change.

If Google Sheets credentials are missing, the app uses `.newsletter_data/` JSON files so the pipeline can be tested locally.

## Client-Editable Content (Sources & Keywords)

The client tunes what the newsletter covers directly in the Google Sheet — no
code change or redeploy:

- **`Sources` tab** — one row per news source (`name`, `url`, `source_type`,
  `priority`, `enabled`). Set `enabled` to `FALSE` to pause a source, or add a
  new row to include one. `source_type` is `official_html`, `media_html`, or
  `rss`.
- **`Config` tab, `keywords` row** — the relevance keywords. Put one keyword per
  line, or separate them with commas (ASCII `,` or full-width `，`). Articles
  matching more keywords score higher and are more likely to be included.
  Leaving the value blank restores the built-in default keyword list.

Both take effect on the next `collect` run.

## Client-Editable Delivery Schedule

The client controls when the newsletter is drafted by editing key/value rows in
the `Config` tab of the Google Sheet:

| key | meaning | example |
| --- | --- | --- |
| `cadence` | `weekly` or `monthly` | `weekly` |
| `send_weekday` | day of week (weekly cadence) | `monday` |
| `send_day_of_month` | day 1-31 (monthly cadence; clamped to month length) | `1` |
| `send_hour` | hour 0-23, in the timezone below | `8` |
| `timezone` | IANA timezone name | `Asia/Hong_Kong` |

Invalid values fall back to safe defaults (weekly / Monday / 08:00 /
`Asia/Hong_Kong`). The pipeline drafts at most once per day, so an hourly
scheduler will not produce duplicate drafts.

## Google Sheet Tabs

The app creates/uses these worksheets:

- `Sources`
- `Articles`
- `Issues`
- `Config`

## Tests

```powershell
pytest
```

