from __future__ import annotations

import requests

from .config import Settings


def brevo_config_issues(settings: Settings) -> list[str]:
    issues: list[str] = []
    if not settings.brevo_api_key:
        issues.append("BREVO_API_KEY is missing")
    if not settings.brevo_sender_email:
        issues.append("BREVO_SENDER_EMAIL is missing")
    if settings.brevo_sender_email and "@" not in settings.brevo_sender_email:
        issues.append("BREVO_SENDER_EMAIL does not look like an email address")
    if settings.brevo_list_id is None:
        issues.append("BREVO_LIST_ID is missing or is not numeric")
    return issues


def create_draft_campaign(settings: Settings, subject: str, html: str) -> str:
    if brevo_config_issues(settings):
        return ""

    response = requests.post(
        "https://api.brevo.com/v3/emailCampaigns",
        headers={
            "api-key": settings.brevo_api_key or "",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        json={
            "name": subject,
            "subject": subject,
            "sender": {
                "name": settings.brevo_sender_name,
                "email": settings.brevo_sender_email,
            },
            "type": "classic",
            "htmlContent": html,
            "recipients": {"listIds": [settings.brevo_list_id]},
        },
        timeout=30,
    )
    try:
        response.raise_for_status()
    except requests.HTTPError as exc:
        detail = response.text[:800]
        raise RuntimeError(f"Brevo campaign creation failed: HTTP {response.status_code}: {detail}") from exc
    return str(response.json().get("id", ""))
