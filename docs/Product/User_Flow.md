# User Flow

## Happy Path

Landing Page

↓

Lead Registration

↓

Unique Email Validation

↓

Song Personalization

↓

Local Validation

↓

Claude Moderation

↓

Lyrics Generation

↓

Lyrics Preview

↓

Accept Lyrics
OR
Generate Again

↓

Suno Song Generation

↓

Store Audio

↓

Send Email

↓

Campaign Finished

## Step Descriptions

**Landing Page** — Visitor arrives at the campaign page and learns about the offer.

**Lead Registration** — Visitor submits their email and basic details to start.

**Unique Email Validation** — System checks the email has not already generated a final song.

**Song Personalization** — User provides personalization inputs (e.g. baby's name, mood selection among the four predefined moods).

**Local Validation** — Client/server-side validation of input format, required fields, and length constraints before any AI call is made.

**Claude Moderation** — Personalization inputs are checked for inappropriate content before lyrics are generated.

**Lyrics Generation** — Claude generates personalized lyrics based on validated, moderated input.

**Lyrics Preview** — User reviews the generated lyrics.

**Accept Lyrics / Generate Again** — User either approves the lyrics to proceed, or requests regeneration (consuming an attempt).

**Suno Song Generation** — Approved lyrics and the selected mood's fixed prompt are sent to Suno to generate the final audio.

**Store Audio** — The generated audio file is stored in Supabase Storage.

**Send Email** — The final song is emailed to the user via Resend.

**Campaign Finished** — The user's journey is complete; no further songs can be generated for that email.

## Lead Registration Endpoint

`POST /api/leads` implements the **Lead Registration** step of the happy path above. It is the first public API of the application — there is no Landing Page UI calling it yet.

**Request body:**

| Field        | Required | Notes                                  |
| ------------ | -------- | -------------------------------------- |
| `campaignId` | yes      | Which campaign the lead registers for. |
| `parentName` | yes      |                                        |
| `babyName`   | yes      |                                        |
| `babyAge`    | no       | In months.                             |
| `city`       | no       |                                        |
| `email`      | yes      | Must be unique across all leads.       |
| `phone`      | no       |                                        |

**Success — `201 Created`:**

```json
{ "leadId": "...", "remainingAttempts": 5, "status": "REGISTERED" }
```

Only these three fields are returned — no internal identifiers (campaign ID, timestamps, etc.) or persistence details are exposed.

**Errors:**

| Status | When                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------- |
| `400`  | The request body is malformed, missing a required field, or fails domain-level validation (e.g. an invalid email format). |
| `409`  | The email has already been used to register a lead (see `docs/Product/Business_Rules.md` — Email Rules).                  |
| `422`  | Any other business rule violation.                                                                                        |
| `500`  | An unexpected/infrastructure error. The response never includes a stack trace or a raw database error.                    |

The endpoint only validates input and maps the result of `CreateLeadUseCase` to an HTTP response — email uniqueness and every other business rule are enforced by the Application and Domain layers, not by the endpoint itself.

## Landing Page

`/` (`app/page.tsx`, sections in `src/features/landing/components/`) is the full public campaign website — the entry point for every visitor, and the only page that isn't gated behind a prior step. It is composed entirely of Server Components; the sole client-side island anywhere on the page is the existing `RegistrationForm` (see below) — nothing about registration is duplicated or reimplemented here.

Top to bottom:

1. **Hero** — the campaign's headline and one-line pitch, plus a "Create your baby's song" call to action. The CTA is a plain anchor (`href="#register"`) to the Registration section further down the same page — no client-side scroll handler, no JavaScript required for it to work.
2. **Campaign explanation** — a short answer to "what is this campaign?": a free, limited-time gift, no cost, no catch.
3. **How it works** — the six-step flow, in order: Register → Describe the baby → AI generates lyrics → You approve the lyrics → AI generates the song → Delivered by email. Each step is shown with a number and a one-line description; no step here is a live progress tracker, just a preview of what happens next.
4. **Registration** — the `#register` anchor target, wrapping the existing `RegistrationForm` (`src/features/lead/components/`) unchanged. This is the same component and the same `POST /api/leads` flow documented under Lead Registration Endpoint above; the Landing Page does not introduce a second registration path.
5. **FAQ** — common questions (cost, turnaround time, changing the lyrics, one song per email, how delivery works), implemented as native `<details>`/`<summary>` disclosures — keyboard- and screen-reader-accessible with zero JavaScript.
6. **Legal disclaimer** — states this is a limited-time promotional campaign (not an ongoing product), that content is AI-generated and automatically reviewed, that one song is available per email while capacity lasts, and what the registration email is used for.
7. **Footer** — campaign name and copyright year.

On successful registration, the flow continues exactly as already documented: the lead id, baby name, and remaining-attempts count are stored in `sessionStorage`, and the user is navigated to `/generate` (the Lyrics Review screen, see below).

**SEO.** `app/layout.tsx` sets `metadataBase`, default Open Graph/Twitter Card metadata, and `robots: { index: true, follow: true }`; `app/page.tsx` overrides the title/description/canonical for `/` specifically. `app/robots.ts` and `app/sitemap.ts` (Next.js's file-based conventions) serve `/robots.txt` and `/sitemap.xml`; only `/` is listed in the sitemap and allowed for crawling — `/generate`, `/song` (mid-funnel steps that depend on prior client state) and `/admin`, `/api` (operator/backend surfaces) are disallowed. `app/layout.tsx` also emits `Organization` and `WebSite` JSON-LD structured data.

**Performance & accessibility.** No images are embedded (avoiding any LCP/CLS cost from unoptimized assets); the only decorative glyph (♪) is `aria-hidden`. Semantic landmarks (`<main>`, one `<section>` per block, `<footer>`) and a single `<h1>` with ordered `<h2>`s establish the page's structure for assistive technology and search engines alike. A production Lighthouse run scored Performance 98, Accessibility 100, Best Practices 100, and SEO 100 (Largest Contentful Paint 2.3s, Cumulative Layout Shift 0).

## Lyrics Generation Endpoints

**`POST /api/lyrics/generate`** implements the **Song Personalization → Claude Moderation → Lyrics Generation** steps of the happy path in one call — see `docs/Architecture/External_Services.md` for why moderation and generation are a single Claude request. It also serves regeneration ("Generate Again"): the same endpoint is called again, and the backend determines whether this is a first attempt or a regeneration by checking whether the lead already has any lyrics versions, rather than trusting a client-supplied flag.

**Request body:** `leadId`, `moodId`, `moodName`, `moodDescription` (optional), `parentMessage`.

**Response — always `200 OK`, whether approved or rejected** (a moderation rejection is a normal, expected outcome, not an HTTP error — see `docs/Product/Business_Rules.md`):

```json
{
  "lyrics": { "id": "...", "content": "...", "version": 1, "approved": false },
  "approved": true,
  "reason": null,
  "remainingAttempts": 5,
  "leadStatus": "GENERATING"
}
```

or, when rejected:

```json
{
  "lyrics": null,
  "approved": false,
  "reason": "...moderation reason...",
  "remainingAttempts": 4,
  "leadStatus": "GENERATING"
}
```

**Attempt consumption** (see `docs/Product/Business_Rules.md` — Attempts Rules): a lead's first-ever generation costs nothing if approved. Every other case — a rejection (first attempt or later) or an explicit regeneration (approved or not) — consumes exactly one attempt. A Claude/network failure never consumes an attempt and is surfaced as `503 claude_unavailable`.

**Other errors:** `400 invalid_request`, `404 lead_not_found`, `422 no_remaining_attempts` / `business_rule_violation`, `500 internal_error`.

**`POST /api/lyrics/approve`** — given `lyricsId`, marks that version approved (rejecting if the lead already has a different approved version, or if this version was already approved/rejected). Response: `{ "lyrics": {...} }`. Errors: `400 invalid_request`, `404 lyrics_not_found`, `422 business_rule_violation`, `500 internal_error`.

## Lyrics Review Screen

`/generate` (`app/generate/page.tsx`) hosts the full generate → review → regenerate → approve loop, orchestrated client-side by `LyricsWorkflow` (`src/features/lyrics/components/`):

1. **Generation form** — shows the baby's name and starting remaining-attempts count (both read from the `sessionStorage` written at registration — there is no separate "fetch lead" endpoint), a mood selector, a message textarea, and a "Generate Lyrics" button. V1 has exactly four predefined moods with no Mood-management UI yet, so the four options are a fixed, documented placeholder list (see the component's source comment) — the same kind of simplification as the campaign id placeholder in the registration form.
2. On submit, `POST /api/lyrics/generate` is called. An **approved** result switches the screen to the **review panel** (song title extracted from the first line of the lyrics, the full lyrics text, the updated remaining-attempts count, and "Approve Lyrics" / "Generate Again" buttons). A **rejected** result stays on the generation form with the moderation reason shown as a friendly banner and the remaining-attempts count updated.
3. **Generate Again** re-submits the same endpoint with the same mood/message; the previous version is never deleted — every version remains queryable via `LyricsRepository.findAllByLead`.
4. **Approve Lyrics** calls `POST /api/lyrics/approve` and, on success, navigates to `/song` — the Song Result screen (see below).

## Song Generation Endpoints

The **Suno Song Generation** step of the happy path is asynchronous: the client is never made to wait for Suno to finish. It starts with `POST /api/song/generate` and finishes with the client polling `GET /api/song/{songId}` — there is no WebSocket or Server-Sent Events push; the frontend polls every 5 seconds until the song reaches a final status. See `docs/Architecture/System_Architecture.md` for the full sequence and state machine.

**`POST /api/song/generate`** — given just `leadId`, the backend looks up everything else server-side (the lead's approved lyrics, and through it the selected mood and its fixed Suno prompt), persists a new `Song` as `PENDING`, and returns immediately — the actual Suno call happens afterward, in the background.

A song can only be started if, in order: the lead exists; the lead has not already generated a final (successfully `COMPLETED`) song; the campaign is active and generation is enabled; and the lead has exactly one approved lyrics version. Exactly one Suno request is made per attempt — never multiple variations (see `docs/Product/Business_Rules.md` — Song Rules).

**Success — `202 Accepted`:**

```json
{
  "songId": "...",
  "status": "PENDING",
  "estimatedNextAction": "Poll GET /api/song/{songId} every 5 seconds until status is COMPLETED or FAILED."
}
```

**Errors:** `400 invalid_request`, `404 lead_not_found`, `409 song_already_exists`, `422 lyrics_not_approved` / `campaign_disabled` / `business_rule_violation`, `500 internal_error`. These are all synchronous validation failures — nothing has been sent to Suno yet, so none of them touch a `Song` row.

**`GET /api/song/{songId}`** — the polling endpoint. Returns only the current status while generation is in progress; once the song reaches `COMPLETED`, the response also includes the `audioUrl`. The provider name, the provider's own song id, and any other Suno-internal detail are never exposed.

```json
{ "songId": "...", "status": "PENDING" }
{ "songId": "...", "status": "GENERATING" }
{ "songId": "...", "status": "COMPLETED", "audioUrl": "https://...", "duration": 125 }
{ "songId": "...", "status": "FAILED" }
```

**Errors:** `400 invalid_request` (missing `songId`), `404 song_not_found`, `500 internal_error`.

A Suno failure — a timeout, the provider being unavailable, or an unexpected response — is always persisted as `FAILED` (never left stuck on `GENERATING`) so the same lead can retry by calling `POST /api/song/generate` again; retries are never automatic (see `docs/Product/Business_Rules.md` — Song Rules).

## Song Result Screen

`/song` (`app/song/page.tsx`, driven by `src/features/song/`) is the final screen of the happy path — it both triggers generation and shows its outcome, closing the loop opened by the Lyrics Review screen:

1. On mount, `useSongResult` (`src/features/song/hooks/`) reads the `leadId`/`babyName` written to `sessionStorage` at registration (redirecting to `/` if missing, same convention as the Lyrics Review screen). If a `songId` from a previous visit is already in `sessionStorage`, it resumes polling that song instead of starting a new one — a lead can only ever generate one final song (see `docs/Product/Business_Rules.md`), so a page refresh must never trigger a second `POST /api/song/generate`.
2. Otherwise, it calls `POST /api/song/generate` once, stores the returned `songId`, and — unless the response is already a terminal status — starts polling `GET /api/song/{songId}` every 5 seconds. Polling stops immediately once the status is `COMPLETED` or `FAILED`; there is no WebSocket or Server-Sent Events channel anywhere in this flow.
3. **While `PENDING`/`GENERATING`** — shows the song title (derived from the baby's name), a loading indicator, and an explanatory message. "Generate Another Song" is shown but always disabled, in every state, since only one final song is ever allowed per lead.
4. **`COMPLETED`** — shows an embedded HTML `<audio>` player (`controls`, `src` set directly to the stored `audioUrl`), the song duration (when available), a "Download Song" link, and a short share message. The download link points straight at the stored audio file — the application never proxies or re-serves it.
5. **`FAILED`** — shows a friendly, generic message asking the user to contact support (the support email is passed down from the server-rendered page via `appConfig.admin.email`, never hardcoded client-side) — no internal error detail, provider name, or stack trace is ever surfaced.

## Email Delivery

Once a Song reaches `COMPLETED` (the `GENERATING -> READY` transition, internally — see `docs/Architecture/System_Architecture.md`), exactly one email is sent to the lead's address via Resend, still as part of the same background job that called Suno — the user is never made to wait for it. See `docs/Architecture/External_Services.md` for the full Resend integration and the idempotency mechanism that guarantees the email is never sent twice, even if the background job were ever to run more than once for the same song.

**Subject:** "Your personalized song is ready!"

**Body:** a greeting, a thank-you message, campaign branding, a direct "Play the song" button, a direct "Download the song" button (both pointing straight at the stored `audioUrl` — never a link back into the application), a support contact address, and a footer — all as responsive, inline-styled HTML suitable for common email clients.

A failure to send this email (Resend unavailable, delivery rejected, etc.) is logged for follow-up; it never fails the song generation itself, since by that point the song has already completed successfully.

## Administrator Workflow

The Administration module is a separate, minimal operational surface for campaign operators — entirely read-only, with no user/role management, campaign configuration, or analytics (see PROJECT_MANIFEST.md). It has no connection to the parent-facing happy path above beyond reading the same persisted data.

1. **Sign in** — `/admin/login` (`app/admin/login/page.tsx`, `src/features/admin/components/LoginForm.tsx`) collects email, password, and an optional "Remember me", and calls `POST /api/admin/login`. On success, the session is set as an HTTP-only cookie by the server (the client never sees the token itself) and the operator is redirected to `/admin/dashboard`. On failure, a single generic "Invalid email or password." banner is shown — never which field was wrong, and never any detail about whether the email exists.
2. **Every other `/admin` page, and every `/api/admin` route, is protected** by `middleware.ts`. An unauthenticated visit to a page redirects to `/admin/login`; an unauthenticated API call returns `401`. See docs/Architecture/System_Architecture.md — Authentication Flow.
3. **Dashboard** — `/admin/dashboard` shows nine summary indicators (see Operational Reports below — no charts) above a searchable, sortable, filterable, paginated participants table (columns: Created, Parent, Baby, Email, Song Status, Email Status, Actions), and an "Export CSV" link that always reflects the currently applied search/filters.
4. **Search** — typing in the search box filters by parent name, baby name, email, or phone (case-insensitive, partial match); any column header can be clicked to sort by it (toggling direction on a repeat click). Both reset back to page 1.
5. **Lead Detail** — clicking "View" on a row opens `/admin/leads/{leadId}` (`src/features/admin/components/LeadDetailView.tsx`): the lead's information, its full lyrics history, the approved version, the song's status/audio player/download button/duration, generation and email-delivery timestamps, the two operational recovery actions below (only ever shown when applicable), and the complete execution history for this lead. Every other field here is read-only; there is no edit control anywhere else on this screen.
6. **Sign out** — a "Log out" button (present on the dashboard) calls `POST /api/admin/logout`, which clears the session cookie.

**Audit history.** Actions are recorded automatically as the operator uses the module: a successful login (`action: "login"`, against the `AdminUser`), viewing a lead's detail page (`action: "view_lead"`, against that `Lead`), and the two operational recovery actions below (`retry_song`/`resend_email`, against the `Song`). There is no UI to create, edit, or delete an audit entry — they exist purely as the read-only trail shown on the Lead Detail screen.

**Provisioning.** There is no sign-up or account-creation flow — admin accounts are provisioned directly in the database (see docs/Architecture/System_Architecture.md — Authentication Flow), consistent with "no user management" being out of scope for this module.

## Operational Recovery

Two manual actions let an operator recover a campaign execution that got stuck, without ever touching lyrics, attempts, or creating a duplicate record. Both live on the Lead Detail screen, only ever appear when applicable, require an explicit confirmation step before doing anything, disable their own trigger for the whole in-flight duration (so a duplicate click can't start the action twice), and show a plain-language success or error notification when they finish. Every use is recorded in the execution history below.

**Retry Generation** — shown only when the song's status is `FAILED`. Confirming it resets the existing `Song` row back to `PENDING` (the same starting state a brand-new song has) and re-runs the exact same background generation workflow used the first time: the lead's already-approved lyrics and mood are reused untouched, no lyrics are ever regenerated, no lyric attempt is ever consumed, and no second `Song` row is ever created — the same `songId` is updated throughout. If it succeeds this time, the one-time automatic email still fires normally, exactly as it would for a song that succeeded on the first try.

**Resend Email** — shown only once the song is `COMPLETED` _and_ the automatic email has already been sent. The operator must type a reason (e.g. "parent said they never received it") before confirming; each confirmation sends exactly one additional copy of the same song-ready email and records who requested it, when, and why. This is entirely separate from the automatic, exactly-once delivery — resending never re-arms it and can never cause a second _automatic_ email to go out.

## Execution History

The Lead Detail screen's history section is a single, chronological (newest-first), read-only timeline built from two kinds of events:

- **System events**, synthesized from timestamps already on the Lead/Lyrics/Song records — no admin attached: Lead created, Lyrics generated (per version), Lyrics approved (the approved version only), Song requested, Song completed, Song failed (shown only while the song's current status is still `FAILED` — a later successful retry naturally stops showing it, since the song is no longer failed), and Automatic email sent.
- **Admin-attributed events**, one row per real action taken in this module: Lead viewed, Retry executed, and Manual email resent (with its reason shown alongside).

## Operational Reports

The Dashboard's summary indicators, the participants table's filters, and the CSV export are all read-only reporting tools for campaign operators — there are no charts, no BI dashboards, and no campaign-configuration controls anywhere in this module (see PROJECT_MANIFEST.md).

**Summary indicators.** Nine plain counts (no trends, no time series): Total Leads, Lyrics Generated, Lyrics Approved, Songs Requested, Songs Completed, Songs Failed, Emails Sent, Email Resent, and Generation Success Rate (Songs Completed ÷ Songs Requested, as a whole-number percentage — 0% when no song has been requested yet, never a division by zero).

**Filters.** The participants table can be filtered by date range (on registration date), Song Status (Pending/Generating/Completed/Failed/No song yet), Email Status (Sent/Not sent), and City — every filter combines with the free-text search and with every other filter (all narrowing the same result set), and changing any of them resets back to page 1.

**CSV export.** The "Export CSV" link streams every Lead matching the currently applied search/filters — not just the visible page — as a CSV file, with one row per lead: Lead (parent name), Baby, Email, Phone, Created Date, Lyrics Status (`NONE`/`GENERATED`/`APPROVED`), Song Status, Email Status, Generation Date, and Delivery Date. The browser downloads it directly (the response sets `Content-Disposition: attachment`); there is no separate "generate report" step or async job to wait on.

**Performance.** Both the on-screen table and the CSV export are paginated internally — the table via the existing page/pageSize parameters, and the export by streaming the result set in fixed-size batches as the response body is written. Neither ever loads the complete matching dataset into memory at once.

## Failure Scenarios

- **Duplicate email**: Registration is rejected because the email has already generated a final song.
- **Invalid input format**: Local validation rejects personalization input before any AI call (e.g. missing name, invalid characters, exceeding length limits).
- **Moderation rejection**: Claude moderation flags the input as inappropriate; an attempt is consumed and the user is asked to revise their input.
- **Attempts exhausted**: User has used all five lyric attempts (via regenerations and/or moderation rejections) without accepting lyrics; the flow ends without a song.
- **Lyrics generation failure**: Claude API call fails or times out; user is shown an error and may retry without consuming an attempt.
- **Lyrics regeneration requested**: User rejects the previewed lyrics and requests a new version; an attempt is consumed.
- **Song generation failure**: Suno API call times out, is unavailable, or returns an unexpected response; the song is persisted as `FAILED` (discovered by the client via polling), is never retried automatically, and does not consume a lyric attempt — the same lead can trigger a fresh attempt via `POST /api/song/generate`.
- **Audio storage failure**: Upload to Supabase Storage fails; the system retries before proceeding to email delivery.
- **Email delivery failure**: Resend fails to deliver the final email; the failure is logged for admin follow-up rather than blocking or retrying automatically — the song itself has already completed successfully by this point (see Email Delivery above).
- **Campaign capacity reached**: The 3,000 song cap is reached; new registrations are declined or queued per campaign rules.
- **Campaign period ended**: The one-month campaign window has closed; the Landing Page no longer accepts new registrations.
