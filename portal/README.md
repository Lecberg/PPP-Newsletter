# Private Newsletter Portal

This site lets the owner and one client review newsletters and manage recipients.
Both sign in through an email link. They do not need Google or Brevo accounts.

## Run locally

Use Node.js 22 or newer and pnpm 11.19.0.

```powershell
cd portal
pnpm install
Copy-Item .env.example .env.local
# Enter credentials privately in .env.local.
pnpm db:migrate
pnpm brevo:setup
pnpm setup:check
pnpm dev
```

Do not overwrite an existing `.env.local`. The current workspace already has one.
Never commit this file. Google server credentials are still needed for Sheets, but not for login.

The name setup adds a `NEWSLETTER_NAME` text field in Brevo. It does not change contacts.
Existing names fall back to Brevo's usual first and last name fields.

For a local demonstration without external changes:

```powershell
$env:PORTAL_DEMO = 'true'
pnpm dev
```

Open `http://127.0.0.1:3000`. Demonstration data stays in memory.
All email sending is simulated. Restart the server to reset it.
This mode cannot run in production or on Vercel, including preview deployments.

## Deploy to Vercel

The project now exists at `https://ppp-newsletter-portal.vercel.app`.
Email login reuses Brevo's individual email service and the existing verified sender.
Email login is deployed to production and preview.
The owner approved removing Brevo's account-wide server-address restriction on 4 October 2026.
This permits Vercel's changing outgoing addresses. The secret Brevo key remains required.
Both deployments successfully submitted login emails for the two approved addresses.
Production and preview have separate Neon databases and login secrets.
Login links work once and expire in ten minutes. Each login lasts up to eight hours.
Old Google login sessions are rejected.
The owner waived the controlled newsletter delivery tests on 4 October 2026 and requested production sending.
Production sending is enabled. Preview sending stays disabled.
Actual newsletter delivery to the controlled inboxes has not been verified.
See `docs/verification.md` for completed checks and remaining setup.

The implementation was released to `main` through pull request #3 on 5 October 2026.
Deploy from the released main revision. The local working branch remains `codex/newsletter-portal`.

1. Sign in to Vercel. Recommended command-line setup: `npm i -g vercel`.
2. Use the existing `ppp-newsletter-portal` project. Its root directory is `portal`.
3. Keep separate Neon databases for production and previews.
4. Configure the variables listed in `.env.example` privately in Vercel's project settings.
5. Set `PORTAL_ALLOWED_EMAILS` to `frankie.wong@todplus.com,u3664746@connect.hku.hk`.
6. Set `PORTAL_OWNER_EMAIL` to the owner's address. Both accounts have the same portal controls.
7. Set `AUTH_EMAIL_SENDER_ID` to the existing active Brevo sender, currently `1`. No new mail password is needed.
8. Set `AUTH_URL` to the stable site address. Emails always link to this address.
9. Run `pnpm db:migrate` against each Neon database. The migrations only add tables and indexes.
10. Keep `PORTAL_SEND_ENABLED=false` for fresh installations until release is approved. Keep previews disabled outside controlled tests.
11. Deploy, check the build, and verify that other email addresses cannot enter or call protected server routes.
12. Enable production delivery with `PORTAL_SEND_ENABLED=true` and redeploy when the owner authorizes release.
13. Configure `PORTAL_GITHUB_TOKEN` privately for manual draft controls. See the draft setup instructions below.

For command-line deployment, run from the repository root because the project root is `portal/`:

```powershell
vercel link --yes --scope ryan-mas-projects-71fa00c3 --project ppp-newsletter-portal
vercel deploy --target preview --yes --scope ryan-mas-projects-71fa00c3
# Rebuild production with its own credentials and approved sending setting:
vercel deploy --prod --yes --scope ryan-mas-projects-71fa00c3
```

The root `.vercelignore` limits uploads to portal files and excludes every local environment file.
Set production `AUTH_URL` to `https://ppp-newsletter-portal.vercel.app`.
Preview uses `https://ppp-newsletter-preview-71fa00c3.vercel.app`.
Use that stable address for preview `AUTH_URL`. Preview login emails start with `[Preview]`.
Vercel also protects preview deployments. Production's stable address has the portal's own login.

Credentials stay on the server. Do not put them in variables beginning with `NEXT_PUBLIC_`.
The portal does not need the AI generation key. The Python GitHub Actions workflow keeps generating drafts.

### Test delivery without contacting real subscribers

Create a separate Brevo list containing only controlled test addresses.
Set `PORTAL_TEST_LIST_ID` to this list for the preview environment.
It must differ from production's `BREVO_LIST_ID`. Preview recipient edits also use the test list.
Use a separate test Google Sheet, with the existing Issues column names.
Create a standard Brevo draft targeting only the test list and record its campaign number in that Sheet.
Set preview `GOOGLE_SHEET_ID` and `DATABASE_URL` to the separate test resources.
Use the stable preview hostname for preview `AUTH_URL`.
Enable `PORTAL_SEND_ENABLED` only for the controlled test.
Never copy live subscriber addresses into the test list.

## Daily use

### Settings and draft creation

Both approved accounts can use the **Settings** page to manage sources, keywords, and drafting times.
Google Sheets remains the settings store. Press **Save changes** to apply changes to the next run.
The current monthly schedule remains day 1 at 08:00 Hong Kong time.
**Automatic drafting** starts Off. Turning it Off pauses scheduled creation while manual creation remains available.
GitHub stays enabled and checks the saved schedule hourly. A selected hour is not an exact start-time guarantee.
Days beyond a month's length use its last day. The configured time zone controls issue dates and daily checks.
Source priority is retained as existing metadata; it does not change article ranking.
An empty keyword field restores the generator's default list.

Use **Create draft now**, then **Create draft**, to start immediately using saved settings.
Each request creates a separate draft, including another draft on the same day. It never sends an email.
A successful manual draft counts toward that day's scheduled draft requirement.
The portal shows queued, creating, ready, failed, or uncertain progress. **Open draft** opens a completed result.
While a request is active or uncertain, another request is blocked. Progress refreshes every 15 seconds while visible.
Do not rerun a draft workflow in GitHub. After a definite failure, submit a fresh portal request instead.
Contact the owner for an uncertain outcome. Check GitHub and Brevo before resolving its database record.
Campaign names include `[portal:<request number>]` to help locate a campaign after an uncertain creation response.
An unresolved settings save also blocks further saves. Check the actual Sheet and stopped request before resolving its audit record.

GitHub setup requires `PORTAL_GITHUB_TOKEN` in Vercel: a fine-grained token for only `Lecberg/PPP-Newsletter`.
Grant Actions read/write and Contents read-only. Store it privately on the server; never paste it into the portal or logs.
Production dispatches only `weekly-newsletter.yml` on `main`. Keep that workflow enabled.
Deployments do not need access to any other repository. Renew the token before its chosen expiry date.

Preview dispatch is disabled until isolated GitHub resources are configured.
Set `PORTAL_DRAFT_REF` to the preview implementation branch. Configure these GitHub repository secrets:
`PORTAL_PREVIEW_GOOGLE_SERVICE_ACCOUNT_JSON`, `PORTAL_PREVIEW_GOOGLE_SHEET_ID`,
`PORTAL_PREVIEW_BREVO_API_KEY`, `PORTAL_PREVIEW_BREVO_LIST_ID`,
`PORTAL_PREVIEW_BREVO_SENDER_EMAIL`, and `PORTAL_PREVIEW_BREVO_SENDER_NAME`.
Use preview's separate Sheet and test list. The runner refuses missing preview credentials or production targets.
Only then set preview's `PORTAL_DRAFT_PREVIEW_READY=true` and redeploy preview.
The token's runtime permissions do not allow adding these repository secrets; the owner configures them privately in GitHub.

Migration `004_settings_drafting.sql` adds request and settings audit records without deleting existing records.
`node --env-file=.env.local scripts/drafting-setup.mjs` initializes only the automatic switch to Off.
An optional `--preview-sheet <separate-sheet-id>` prepares missing preview settings tabs from existing settings.
Do not rerun this setup command once clients start using the automatic switch unless intentionally pausing it.

1. Enter an approved email address and select **Send login link**. Check your inbox and spam folder.
2. Open the email link and select **Continue to portal**. Opening the page alone does not use the link.
   Keep the original sign-in tab open. It enters the portal after the same browser confirms your login.
   The email tab closes when permitted. Otherwise, it tells you to return to the original tab.
   If the original tab is closed or you use a different browser, the email tab opens the portal itself.
3. Open **Newsletter** and read the draft. **Previous issues** opens issue history.
4. Click **Choose recipients**, or open **Recipients** and use **Choose receivers for**.
5. Tick **Receive this issue** beside each person who should receive that newsletter. Choices save immediately.
6. Return to **Newsletter**. Click **Confirm delivery** and check the subject and selected recipient count.
7. Click **Confirm and send**. **Submitted for sending** means Brevo accepted the request.
8. Use **Refresh status** to check whether Brevo has marked it **Sent**.

Recipient choices apply only to the chosen newsletter. Each new issue starts with all subscribed recipients selected.
Unticking someone keeps their contact and subscription intact. Unsubscribed people cannot be selected.
You can still add, correct, or remove contacts from **Recipients**.
Choices survive a refresh and are shared between the two approved users.
A choice changed in another tab requires a refresh before another change or delivery.
Delivery needs at least one subscribed recipient selected. Choices lock after a delivery request.
Production sending is enabled at the owner's request. Every newsletter still requires final confirmation.

Wait 60 seconds before requesting another link. Each address can request five links per hour.
Each network address can request 20 links per hour. Limits apply across tabs and server instances.
The acknowledgement does not reveal which addresses have access. Other addresses receive no email.
If a link has expired, was used, or was refreshed after opening, request a new one.
The site removes the secret from the browser address and keeps it only until confirmation.
Login emails never add subscribers or change unsubscribe choices.
If mail stops arriving, run `pnpm setup:check`. Check Brevo's individual email delivery logs and credits.
Do not copy login links, cookies, request bodies, or email content into logs or support messages.

Removal affects this newsletter list only. It does not delete the contact from Brevo.
Unsubscribed contacts cannot have their email changed through the portal.
Name-only changes omit the email field so Brevo does not reset their unsubscribe choice.
Adding an address already present in Brevo shows a duplicate message rather than changing its subscriptions.
Recipients excluded by unsubscribe status do not count as eligible recipients.
Brevo may also exclude addresses through its own delivery rules, so this count is not a delivery guarantee.

## Delivery records and recovery

Neon stores who approved each campaign, when they approved it, and the reviewed content and recipients.
Each approval attempt stays in the record, including a rejected attempt followed by a new approval.
These records contain private contact details. Restrict database access to the site owner.
The portal updates matching `approval_status` cells in Sheets without changing existing columns.
If Sheets is unavailable, the approval stays in Neon. A later status refresh retries the Sheet update.

A shared database lock prevents overlapping sends, recipient choices, and contact changes.
Locks do not expire automatically. A stopped server request must never silently grant a second send attempt.

Neon stores each issue's excluded contact numbers and choice version separately from subscriptions.
Changing choices requires a fresh delivery review, including when a choice is changed back.
When preparing delivery, the portal creates a private Brevo exclusion list for that campaign if needed.
It keeps the main newsletter list as the destination, preserving its unsubscribe rules.
The portal verifies both the exclusion list and campaign settings before requesting delivery.
If every recipient is selected again after preparation, the portal keeps its owned exclusion list empty.
Brevo rejects an empty exclusion setting. An empty owned list avoids that setting while excluding nobody.
Preparation failure does not request a send. Saved approval records include the reviewed choices and delivery settings.
Do not edit or delete lists named `PPP portal exclusions ...` while their campaign is pending or sending.
These lists belong to individual campaigns. They are never reused for future newsletters.

If the site reports **Outcome unknown**, do not repeat delivery.
Refresh its status. Brevo-confirmed sending or sent status resolves the record.
A draft status alone cannot prove that a timed-out send request was rejected.

Run `pnpm db:inspect` to inspect operation states without printing recipient details.
If a lock remains after a terminated request, the owner must check Vercel runtime logs and Brevo first.
Confirm the original request is no longer running. Keep any `submitting` or `unknown` approval record.
Only then remove the exact stale lock through Neon's SQL editor:

```sql
DELETE FROM portal_locks WHERE scope = '<verified-list-scope>' AND token = '<verified-lock-token>';
```

The owner can read the token privately with `SELECT * FROM portal_locks` in Neon.
Removing a lock does not remove the campaign's protection against a second send.
Do not reset an uncertain approval based only on Brevo still showing draft.
If Brevo confirms no sending occurred, record that evidence privately before changing the outcome to `rejected`.

Monitor Vercel runtime errors and unresolved approval states after deployment.
If Brevo reaches its request limit, the portal shows the supplied reset time in Hong Kong time.
Wait until that time before refreshing. Delivery requests are never repeated automatically.
Issue history loads in batches. Recipient choices refresh only the chosen issue, reducing provider requests.
Visited portal tabs retain their preview, search, and unsaved edits until the page is closed or reloaded.
Switching tabs does not fetch their contents again. Saved recipient changes refresh delivery details when Newsletter is shown.
Refresh controls remain available to check for changes made elsewhere.
To stop sending, set `PORTAL_SEND_ENABLED=false` and redeploy.
Restore the previous Vercel deployment to roll back code. Keep the additive database tables.

## Verification

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Automated checks cover access rules, deployment isolation, stale reviews, shared locks,
duplicate sends, unknown outcomes, recipient ownership, and unsubscribe protection.
`docs/verification.md` records browser checks and remaining external setup.

Fourteen additional checks run against the isolated preview database when explicitly enabled.
They use fake newsletter providers and never send email.

```powershell
$env:PORTAL_LIVE_DATABASE_TESTS = 'true'
node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/neon.integration.test.ts tests/email-neon.integration.test.ts
Remove-Item Env:PORTAL_LIVE_DATABASE_TESTS
```

Use the preview database only. The current local file points to preview Neon.
Each check removes its own synthetic records afterward. Login checks use generated test addresses and send no email.
