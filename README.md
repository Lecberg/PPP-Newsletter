# Hong Kong PPP Weekly Newsletter MVP

This project collects Hong Kong public-private partnership and infrastructure news, filters and deduplicates articles, generates an English + Traditional Chinese newsletter draft with an OpenAI-compatible API, stores workflow data in Google Sheets, and creates a draft Brevo campaign for human review.

The MVP never auto-sends email. A reviewer approves and sends the campaign inside Brevo.

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
```

If Google Sheets credentials are missing, the app uses `.newsletter_data/` JSON files so the pipeline can be tested locally.

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

