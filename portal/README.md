# Private Newsletter Portal

This site lets the owner and one client review newsletters and manage recipients.
Both use Google sign-in. They do not need separate Brevo accounts.

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
Never commit this file. Google login credentials differ from the Sheets service account credentials.

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
Its current deployment shows the login setup screen. Client access is not ready yet.
Neon terms acceptance and Google sign-in setup remain pending. Sending is disabled.
See `docs/verification.md` for completed checks and remaining setup.

The implementation is on `codex/newsletter-portal`, with draft pull request #3.
The main branch remains unchanged. Deploy this branch manually until it is merged.

1. Sign in to Vercel. The Codex connection can read account data, but its deployment tool is currently unavailable.
2. Create `ppp-newsletter-portal` in the owner's account. Import this repository and set its root directory to `portal`.
3. Connect Neon through Vercel Marketplace. Use a separate database for previews.
4. Configure the variables listed in `.env.example` privately in Vercel's project settings.
5. Set `PORTAL_ALLOWED_EMAILS` to exactly the owner's and client's Google addresses, separated by a comma.
6. Set `PORTAL_OWNER_EMAIL` to the owner's address. Both accounts have the same portal controls.
7. Create a Google web login client. Register `https://<production-host>/api/auth/callback/google` as its redirect address.
8. Set `AUTH_URL` to `https://<production-host>`. Register `http://localhost:3000/api/auth/callback/google` for local login if needed.
9. Run `pnpm db:migrate` against the production Neon database. The migration only adds portal tables.
10. Keep `PORTAL_SEND_ENABLED=false` until login and test delivery have been verified.
11. Deploy, check the build, and verify that other Google accounts cannot open private pages or call the server routes.
12. After the controlled delivery test passes, enable production delivery and redeploy.

For command-line deployment, run from the repository root because the project root is `portal/`:

```powershell
vercel link --yes --scope ryan-mas-projects-71fa00c3 --project ppp-newsletter-portal
vercel deploy --target preview --yes --scope ryan-mas-projects-71fa00c3
# After login, database, and controlled delivery checks pass:
vercel deploy --prod --yes --scope ryan-mas-projects-71fa00c3
```

The root `.vercelignore` limits uploads to portal files and excludes every local environment file.
Set production `AUTH_URL` to `https://ppp-newsletter-portal.vercel.app`.
Register `https://ppp-newsletter-portal.vercel.app/api/auth/callback/google` with Google.

Credentials stay on the server. Do not put them in variables beginning with `NEXT_PUBLIC_`.
The portal does not need the AI generation key. The Python GitHub Actions workflow keeps generating drafts.

### Test delivery without contacting real subscribers

Create a separate Brevo list containing only controlled test addresses.
Set `PORTAL_TEST_LIST_ID` to this list for the preview environment.
It must differ from production's `BREVO_LIST_ID`. Preview recipient edits also use the test list.
Use a separate test Google Sheet, with the existing Issues column names.
Create a standard Brevo draft targeting only the test list and record its campaign number in that Sheet.
Set preview `GOOGLE_SHEET_ID` and `DATABASE_URL` to the separate test resources.
Register a stable preview hostname for Google login and use that hostname for preview `AUTH_URL`.
Enable `PORTAL_SEND_ENABLED` only for the controlled test.
Never copy live subscriber addresses into the test list.

## Daily use

1. Sign in with an approved Google account.
2. Open **Recipients** to add, correct, or remove people.
3. Open **Newsletter** and read the draft. **Previous issues** opens issue history.
4. Click **Confirm delivery**. Check the subject and recipient count in the final dialog.
5. Click **Confirm and send**. **Submitted for sending** means Brevo accepted the request.
6. Use **Refresh status** to check whether Brevo has marked it **Sent**.

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
