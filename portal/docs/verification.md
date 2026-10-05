# Verification record

Checked on 3–4 October 2026, using Hong Kong time. Later sections supersede earlier setup notes.

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

The current production deployment has Google sign-in enabled. The owner must finish account and delivery checks before sharing it with the client.
All seven protected production routes returned HTTP 401 and private, no-store headers when called without a portal session.
The homepage redirected to login. A real Google sign-in with an unapproved account returned `AccessDenied`.
That account received no portal access. Google requested only name, profile picture, and email.
No real newsletter email was sent.

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
The owner created the web login credential. Production, stable preview, and local callback addresses are registered.
Stored the credential privately in Vercel for production and preview, then redeployed both environments successfully.
Google rejected `frankie.wong@todplus.com` as an ineligible test account.
It also rejected `u3664746@connect.hku.hk` because it requires an active Google account.
The application's original two-address allowlist remains unchanged.
Approved-account login checks and controlled delivery remain pending the owner's account clarification and test address.
Created a separate test Google Sheet through the owner's browser, using the same five Issues headers.
Confirmed that the existing server account can read it. Created one bilingual controlled test draft.
Brevo requires a contact before the test list can be assigned to that draft.
The owner's controlled recipient address remains pending. No test email has been sent.
The latest preview uses the isolated resources. Its seven protected routes also returned HTTP 401
and private, no-store headers without a portal session.
GitHub's portal checks passed for draft pull request #3. The main branch remains unchanged.

## Email login replacement — 4 October 2026

Replaced Google login in the portal source with Auth.js email links sent through Brevo.
The original two approved addresses remain unchanged. Links expire after ten minutes and work once.
Sessions have an absolute eight-hour limit. Old Google sessions no longer grant access.
The confirmation page removes the secret from the browser address and waits for a button click.
Direct Auth.js provider login and callback requests are blocked in both request methods.

- All 87 ordinary portal tests pass. The 12 opt-in live database tests are skipped by default.
- The six existing live approval tests and six new live login tests passed against preview Neon.
- Live login checks use synthetic approved addresses and stored token hashes. They do not send email.
- These checks verify actual Auth.js session cookies, logout, expiry, replay refusal, concurrent confirmation,
  shared network limits, and address cooldown and hourly limits. Each check removes its own test records.
- The 33 Python tests, portal type checks, and local and preview production builds pass.
- Additive login tables and indexes were applied to both production and preview Neon databases.
- The existing active Brevo sender, ID 1, is configured for both deployments.

Browser checks used the built-in browser at 1536 × 1024 and 390 × 844.
The login form, generic acknowledgement, resend countdown, confirmation screen, invalid-link message,
and recovery link work. No framework overlay or relevant browser console errors appeared.
The approved white and navy design remains intact. The phone form fits the viewport.
Local setup checks confirm Brevo, Sheets, and the database are reachable. Newsletter delivery stays disabled.

The stable preview has the new login code. Its cloud checks pass for unapproved addresses,
cross-site requests, invalid input, blocked direct callbacks, and invalid tokens.
A local login email reached the owner's mail server, according to Brevo's delivered event.
No newsletter or subscriber changes occurred during email-login testing.

Production release remains pending Brevo server access approval.
Brevo rejects Vercel email requests with HTTP 401, code unauthorized, because of its server-address restriction.
The account's Authorized IPs page confirms API blocking is active. Three preview deployments used different
Amazon server addresses, matching the three blocked calls in Brevo's table.
Disabling this account-wide restriction requires the owner's explicit approval. The secret API key remains required.
Keeping the restriction requires a stable outgoing server address rather than these changing addresses.
The confirmation dialog is prepared but has not been submitted.
Google login secrets remain available for recovery until the replacement passes cloud delivery checks.
Actual inbox-link confirmation by both people remains pending. Controlled newsletter delivery remains pending separately.

## Email login release — 4 October 2026

The owner explicitly approved removing Brevo's account-wide server-address restriction.
The account's Authorized IPs page now shows API blocking deactivated. API keys are still required.
Preview login emails for both approved addresses have Brevo delivered events.
The owner confirmed that the preview email link opened the portal successfully.
Production was then deployed with its own database and login secret, using the stable production address.
Both production login requests returned HTTP 202. Public login checks and all seven protected-route checks pass.
The production page displays the email form with the approved white and navy design.
GitHub's checks passed for commit 3def018eae64c60a6a341c1decf35a82ad130594.
The owner confirmed production email login and access to both Newsletter and Recipients.
Removed AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET from production and preview Vercel settings.
Kept the Google server credentials used for Sheets. The old web login credential backup remains private for recovery.
Both real inboxes have delivered preview messages; one person has confirmed the complete preview and production flows.
The other person's individual inbox confirmation remains an operational follow-up.
Newsletter sending remains disabled. The controlled newsletter delivery test remains a separate pending task.

## Recipient choices for each issue — 4 October 2026

Added a **Receive this issue** checkbox beside every recipient and a **Choose receivers for** issue selector.
New issues start with all subscribed contacts included. Unticking a contact affects only that issue.
Choices save in Neon and remain after a refresh. They do not remove contacts or change subscription choices.
Unsubscribed contacts cannot be selected. Pending or completed delivery requests lock recipient choices.
Choice changes and sends share the existing list lock. Version checks reject changes from stale tabs.
Every choice change requires a fresh delivery review, even when the choice changes back.

Brevo sends campaigns to lists rather than individual contact numbers.
Delivery preparation creates a private exclusion list owned by one campaign when needed.
It verifies exact excluded membership and campaign targeting before requesting delivery.
The original main list stays the destination, preserving its unsubscribe rules.
Partial preparation, provider timeouts, changed content, and unexpected exclusions abort without requesting a send.
Approval records retain the selected choices and final delivery settings.
The new migration only adds `portal_recipient_selections`. It passed against production and preview Neon.

- All 109 ordinary portal tests pass. The 14 opt-in database tests are skipped by default.
- All 14 real preview database checks passed, including concurrent choice changes and persistent choices.
- These database checks use fake newsletter providers. They never send email and remove their synthetic records.
- All 33 existing Python tests pass.
- Desktop checks at 1536 × 1024 and phone checks at 390 × 844 passed.
- Browser checks covered including and excluding recipients, refresh persistence, searching, and switching issues.
- A zero-recipient selection disabled delivery. The final confirmation showed the selected recipient count.
- Previous sent issues had disabled checkboxes. Unsubscribed contacts stayed disabled throughout.
- The phone table scrolls inside its own region. The page fits the phone width.
- No browser warnings, errors, or framework overlays appeared during these checks.

Screenshots are saved outside the repository as `recipient-selection-desktop.png` and `recipient-selection-mobile.png`.
Browser checks used explicitly marked local demonstration data. They changed no real subscriber choices.
Actual newsletter delivery with chosen recipients still requires the separate controlled delivery test.
Sending stays disabled in both cloud environments.

Preview and production cloud builds passed for recipient choices at commit `d52a0ab76c3dd060161f3e5c07792e10e7735324`.
The stable preview points to `dpl_FAxGAW89DrLncPEDXvjk9afKC9T2`.
Production points to `dpl_2T2gsfadwAjsMVW7CCXK4F5GaLMG` at the existing production address.
All nine protected routes in both environments returned HTTP 401 and private, no-store headers without login.
These checks include the new issue-recipient read and choice-update routes.
The live production browser opened the existing email login screen correctly after deployment.
GitHub's Newsletter Portal Checks passed for the implementation commit.
Authenticated checkbox behavior was checked locally. It has not yet been checked in a real user's cloud session.
No real newsletter, subscription, or recipient choice changed during this release.

## Controlled delivery preparation — 4 October 2026

The owner provided two controlled test inboxes and authorized test newsletters to them.
Both addresses were new Brevo contacts. Added them only to the isolated preview test list, ID 9.
The production list, ID 5, was not changed.
The owner signed in to the stable preview in Edge as an approved account.
The email link completed login in its new tab. The original login tab did not navigate automatically.

No controlled newsletter was sent during preparation.
Brevo rejected campaign updates containing `exclusionListIds: []` with HTTP 400, `missing_parameter`.
Changed delivery preparation to retain the campaign's owned exclusion list even when it has no members.
Added a regression check for selecting everyone again after uncertain preparation.
Then Brevo returned HTTP 429 for campaign requests. Its headers reported a 100-request window,
zero remaining requests, and roughly 49 minutes until reset, around 16:03 Hong Kong time.
Do not treat the delivery test as passed or enable production sending until actual delivery is verified.

Reduced issue-history reads to one paged Brevo summary request instead of one request per historical issue.
Recipient choice updates and issue switching reuse the loaded history while checking fresh issue data.
Sending still rechecks fresh content, targeting, recipients, and approvals under the shared lock.
Rate-limit errors now show the provider's reset time and do not repeat requests.
All 114 ordinary portal tests and the local production build passed after these changes.
The 14 opt-in database checks and 33 Python checks passed earlier; these changes do not alter their tables or Python code.

The owner chose to wait until returning before retrying the two newsletters. No automatic retry was scheduled.
Both cloud environments now have `PORTAL_SEND_ENABLED=false`, confirmed from fresh environment downloads.
Removed the unaliased temporary preview deployment that had test sending enabled.
Preview and production rebuilt successfully at implementation commit `e4acea009cfa2cab22b53504bcb3fa5bf87cdc5f`.
Stable preview uses `dpl_5deji8F8FcimoxPDqNvkMh64qnEJ`. Production uses `dpl_CAKiyzDJbWE9GHfDAWfbvNXzKHBb`.
All nine protected-route checks passed in each environment. GitHub's implementation checks passed.
Local browser checks confirmed that choices, switching issues, and the final confirmation still work.
Local request logs confirmed that choice updates and switching issues do not reload the complete history.
The original preview login tab opened the portal when navigating to its homepage, using the completed login session.
Refreshing `/login` alone retains its login form; the new email-link tab is the normal completed-login tab.
The signed-in preview displayed the new request-limit message. The summary endpoint reported a reset at 16:00 Hong Kong time.
Campaign detail requests previously reported a reset around 16:03. Recheck after 16:05 before resuming.
Screenshot: `controlled-delivery-limit.png`, saved outside the repository.

## Production sending enabled at the owner's request — 4 October 2026

The owner explicitly asked to skip the controlled newsletter delivery tests and prepare the portal for use.
This replaces the earlier requirement to keep production sending disabled until those tests pass.
Actual delivery to the two controlled inboxes remains unverified; the tests were waived, not passed.
No newsletter was sent during this release. Test contacts remain outside the production list.

Updated only production's `PORTAL_SEND_ENABLED` to `true` and rebuilt production with its existing credentials.
Fresh environment downloads confirm production sending enabled and preview sending disabled.
The preview still uses its separate database, login secret, test Sheet, and mailing list.
Production deployment `dpl_5z2J4XYGjXgk8CtMnWtcKcjqqVvF` is READY at the existing production address.
The cloud build and TypeScript checks passed. No application code or database schema changed in this release.

The existing approved user's Edge session opened the live draft successfully after deployment.
The draft remains awaiting approval, with one selected eligible recipient and an enabled **Confirm delivery** button.
The final confirmation displayed the subject and selected count; cancelled without clicking **Confirm and send**.
The live Recipients page loaded the configured production list and its per-issue receiver checkbox.
No recipient details or choices were changed. Screenshot: `portal-ready-production.png`, saved outside the repository.
All nine protected-route checks returned HTTP 401 with private, no-store headers without portal login.
Per-issue choices, unsubscribe protection, shared locks, fresh review checks, and uncertain-send protection remain active.
The operating guide now reflects enabled production sending and the owner's waiver.

## Settings and draft controls — 5 October 2026

The owner requested portal editing of Sources and Config, immediate manual drafts, and an automatic-drafting switch.
Both approved accounts receive the same controls. Sheets remains the settings store.
Settings saves preserve unrelated columns and editing instructions, validate entries, reject stale versions, and record changes in Neon.
Draft requests have unique numbers, persistent states, and a database constraint limiting active or uncertain requests to one.
The GitHub workflow separates scheduled checks from immediate requests and prevents overlapping creation without cancelling active work.
It returns a small campaign result artifact. The portal verifies the matching issue and Brevo campaign before reporting Ready.
Manual requests can create separate drafts on the same day. Automatic drafting starts Off.
Time-zone-aware daily checks count only issues containing a successful campaign number.
Existing article ranking and email delivery confirmation remain unchanged.

The owner explicitly waived automated tests, browser tests, and controlled draft/email tests for this change.
No such tests were run. A local deployment build completed successfully, including its required TypeScript step.
Migration 004 was applied to production and preview without deleting existing login, approval, selection, or operation records.
Initialized only the automatic-drafting flag to Off in production and the isolated preview Sheet.
Preview's missing settings tabs were initialized from existing settings, preserving its controlled Issues history.
No draft was created and no email was sent during implementation.
The runtime GitHub token was absent when implementation began. It must be configured privately in Vercel.
Preview drafting remains blocked until its isolated GitHub credentials and readiness setting are configured.

Released through PR #3 to `main` at merge commit `8b98cfab95564eddfbcd119ec36d71847f08350d`.
Both implementation and merge commits include `[skip ci]` to honor the owner's request not to run tests.
Re-enabled the fixed newsletter workflow using the existing repository credential after initializing the automatic flag Off.
GitHub reports the workflow active. The enable action triggered no draft run.
Production cloud build completed with the new interfaces and required TypeScript compilation.
Deployment `dpl_7afQknBZ7UUSyyBnGwxA2guQZCkt` is READY at the stable production address.
The manual control remains unavailable until the owner adds the scoped runtime token in Vercel and the site is redeployed.
Preview cloud build also completed. Stable preview points to `dpl_7TMSfBrHRBatzNmyTxUwTXTUoZXX`.
Preview draft dispatch and newsletter sending remain disabled. No browser or functional release checks were performed.
