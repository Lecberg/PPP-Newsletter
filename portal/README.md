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
Old Google login sessions are rejected. Sending remains disabled until controlled delivery checks pass.
See `docs/verification.md` for completed checks and remaining setup.

The implementation is on `codex/newsletter-portal`, with draft pull request #3.
The main branch remains unchanged. Deploy this branch manually until it is merged.

1. Sign in to Vercel. Recommended command-line setup: `npm i -g vercel`.
2. Use the existing `ppp-newsletter-portal` project. Its root directory is `portal`.
3. Keep separate Neon databases for production and previews.
4. Configure the variables listed in `.env.example` privately in Vercel's project settings.
5. Set `PORTAL_ALLOWED_EMAILS` to `frankie.wong@todplus.com,u3664746@connect.hku.hk`.
6. Set `PORTAL_OWNER_EMAIL` to the owner's address. Both accounts have the same portal controls.
7. Set `AUTH_EMAIL_SENDER_ID` to the existing active Brevo sender, currently `1`. No new mail password is needed.
8. Set `AUTH_URL` to the stable site address. Emails always link to this address.
9. Run `pnpm db:migrate` against each Neon database. The migrations only add tables and indexes.
10. Keep `PORTAL_SEND_ENABLED=false` until login and test delivery have been verified.
11. Deploy, check the build, and verify that other email addresses cannot enter or call protected server routes.
12. After the controlled delivery test passes, enable production delivery and redeploy.

For command-line deployment, run from the repository root because the project root is `portal/`:

```powershell
vercel link --yes --scope ryan-mas-projects-71fa00c3 --project ppp-newsletter-portal
vercel deploy --target preview --yes --scope ryan-mas-projects-71fa00c3
# After preview login and database checks pass; keep newsletter sending disabled:
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

1. Enter an approved email address and select **Send login link**. Check your inbox and spam folder.
2. Open the email link and select **Continue to portal**. Opening the page alone does not use the link.
3. Open **Recipients** to add, correct, or remove people.
4. Open **Newsletter** and read the draft. **Previous issues** opens issue history.
5. Click **Confirm delivery**. Check the subject and recipient count in the final dialog.
6. Click **Confirm and send**. **Submitted for sending** means Brevo accepted the request.
7. Use **Refresh status** to check whether Brevo has marked it **Sent**.

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

A shared database lock prevents overlapping sends and recipient changes.
Locks do not expire automatically. A stopped server request must never silently grant a second send attempt.

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

Twelve additional checks run against the isolated preview database when explicitly enabled.
They use fake newsletter providers and never send email.

```powershell
$env:PORTAL_LIVE_DATABASE_TESTS = 'true'
node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/neon.integration.test.ts tests/email-neon.integration.test.ts
Remove-Item Env:PORTAL_LIVE_DATABASE_TESTS
```

Use the preview database only. The current local file points to preview Neon.
Each check removes its own synthetic records afterward. Login checks use generated test addresses and send no email.
