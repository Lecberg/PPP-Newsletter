# Verification record

Checked on 3–4 October 2026, using Hong Kong time.

## Automated checks

- All 59 portal tests pass. They cover login restrictions, request origins, isolated previews, Brevo requests, recipient management, and approval handling.
- Sending tests cover stale reviews, concurrent actions, repeated requests, uncertain responses, definite rejection, and failed database or Sheet writes.
- Issue history uses Brevo's actual subject and status. Available drafts appear first; deleted campaigns are omitted.
- The existing Python suite passes. Its four dated CLI fixtures now use a fixed test date.
- The production Next.js build and TypeScript checks pass.
- Private environment files, build output, and dependencies are ignored by Git.

## Browser checks

Used Codex's built-in browser. No browser fallback was needed.
Checked the approved design size of 1536 × 1024 and a phone size of 390 × 844.

Verified these interactions with local sample data:

- Open the latest newsletter and its isolated bilingual preview.
- Open previous issues and view their status.
- Save a recipient name change.
- Add a recipient and remove them after confirmation.
- Keep an unsubscribed recipient's email field locked.
- Open the final delivery dialog, including subject and eligible count.
- Submit simulated delivery and disable the repeat-send button.
- Fit both screens within the phone viewport. The recipient table scrolls inside its own region.
- The production server redirects unauthenticated homepage visits to login. All seven protected read/write route checks returned HTTP 401 and private, no-store headers.

Local demonstration never calls Brevo or Sheets. No real email was sent during these browser checks.

## Visual comparison

Inspected both accepted concept images and the latest browser screenshots with `view_image`.
Screenshots are in `screenshots/`. Accepted concept references are in `design/`.

| Comparison | Concept | Implemented result |
| --- | --- | --- |
| Layout | Newsletter preview beside delivery details | Same structure; panels stack on phones |
| Recipient layout | Table beside an edit form | Same structure; table stays a table on phones |
| Palette | White surfaces, navy controls, cool gray rules | Preserved |
| Type | Serif headings, plain sans serif controls | Preserved; increased recipient heading and form sizes after comparison |
| Header | Brand, two tabs, sign out | Preserved; centered navigation after comparison |
| Controls | Confirm delivery, Add recipient, Save changes, Edit, Remove | Preserved; all have working handlers |
| Spacing | Generous margins and lightly bordered panels | Preserved; corrected mobile grid overflow |

Primary headings, tabs, field labels, and action labels match the accepted concepts.
Functional additions include refresh buttons, final confirmation dialogs, setup/error messages, and approval details.
Local sample content and recipient counts differ from the concepts so test data remains clearly fictional.
Subscription status is plain read-only text. The concept's disabled dropdown was replaced to avoid implying it can be changed.
The preview preserves the real email's original formatting in production; it does not recreate sample article content.

## Live read checks and setup

Brevo and Google Sheets both returned successful responses using existing local credentials.
The Issues sheet has the expected columns. Brevo's report uses `lists`, `exclusionLists`, and `segments` for targeting.
Added support for these report fields alongside the campaign creation field names.
Created the `NEWSLETTER_NAME` text field in Brevo. No contact records changed.

## Cloud deployment setup — 4 October 2026

The Vercel command-line tool is now signed in. Created `ppp-newsletter-portal` with root `portal/`.
The application requires Node.js 22 or newer. Vercel's builds selected Node.js 24.
Its install and build commands use the project's pinned pnpm version through Corepack.
Production and preview cloud builds passed. Functions run in Hong Kong.

- Production address: `https://ppp-newsletter-portal.vercel.app`
- Stable preview: `https://ppp-newsletter-preview-71fa00c3.vercel.app`

Vercel assigned the first deployment to production automatically. That deployment remains a setup screen with Google login disabled.
The owner must finish the pending setup and live checks before sharing it with the client.
All seven protected production routes returned HTTP 401 and private, no-store headers when called without a portal session.
The homepage redirected to login. No real email was sent.

Production credentials for Brevo and Sheets are configured as server secrets. Both approved addresses are configured.
Sending remains disabled. Preview has its own session secret and a separate database.
Its recipient controls use a separate Brevo test list. The production list is never selected for previews.
The deployment upload contains only portal files. Environment files, Python output, dependencies, and draft files are excluded.

The owner accepted Neon's terms. Production and preview each have their own free database in Singapore.
Both databases have the additive portal tables. Their migrations passed.
Six checks passed against the real preview database. They covered concurrent locks, complete saved reviews,
retained approval history, status updates, competing server requests, and uncertain sends across server instances.
These checks used fake Brevo and Sheets providers. They sent no email and removed their synthetic database records.
The usual test run skips these six checks unless explicitly enabled against the preview database.

Created an empty controlled test list in Brevo, separate from production's configured list.
Verified that the test list has zero contacts. No live contacts were changed.
Google's app policy is accepted in the existing `hk-ppp-newsletter` project.
The web login form is prepared with production, stable preview, and local callback addresses.
Its final credential creation awaits the owner. Real Google login and controlled delivery remain pending.
Created a separate test Google Sheet through the owner's browser, using the same five Issues headers.
Confirmed that the existing server account can read it. Created one bilingual controlled test draft.
Brevo requires a contact before the test list can be assigned to that draft.
The owner's controlled recipient address remains pending. No test email has been sent.
The latest preview uses the isolated resources. Its seven protected routes also returned HTTP 401
and private, no-store headers without a portal session.
GitHub's portal checks passed for draft pull request #3. The main branch remains unchanged.
