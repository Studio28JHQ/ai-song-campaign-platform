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

## Lead Registration Screen

`/` (`app/page.tsx`) is the registration screen — the first, minimal version of the Landing Page. It shows only a campaign logo placeholder, a page title, a short subtitle, and the registration form; no storytelling sections, images, or marketing content exist yet.

The form (`src/features/lead/components/RegistrationForm.tsx`) collects parent name, baby name, baby age, city, email, and phone, validates them client-side with React Hook Form + Zod (required fields, email format, positive baby age, trimmed strings) for instant feedback, then calls `POST /api/leads`. The submit button is disabled while the request is in flight.

On success, the returned lead id, the submitted baby name, and the starting remaining-attempts count are stored in `sessionStorage`, and the user is navigated to `/generate` — now the Lyrics Review screen (see below). On failure, a duplicate email surfaces as a field-level error under the Email input; every other error (validation, business rule, unexpected server error) surfaces as a form-level banner with a user-friendly message.

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
3. **Dashboard** — `/admin/dashboard` shows four summary cards (Total Leads, Songs Completed, Songs Pending, Songs Failed — no charts) above a searchable, sortable, paginated participants table (columns: Created, Parent, Baby, Email, Song Status, Email Status, Actions).
4. **Search** — typing in the search box filters by parent name, baby name, email, or phone (case-insensitive, partial match); any column header can be clicked to sort by it (toggling direction on a repeat click). Both reset back to page 1.
5. **Lead Detail** — clicking "View" on a row opens `/admin/leads/{leadId}` (`src/features/admin/components/LeadDetailView.tsx`): the lead's information, its full lyrics history, the approved version, the song's status/audio player/download button/duration, generation and email-delivery timestamps, and the audit history for this lead (including the "view_lead" entry this very visit just created — see below). Every field here is read-only; there is no edit control anywhere on this screen.
6. **Sign out** — a "Log out" button (present on the dashboard) calls `POST /api/admin/logout`, which clears the session cookie.

**Audit history.** Two actions are recorded automatically as the operator uses the module: a successful login (`action: "login"`, against the `AdminUser`), and viewing a lead's detail page (`action: "view_lead"`, against that `Lead`). There is no UI to create, edit, or delete an audit entry — they exist purely as the read-only trail shown on the Lead Detail screen.

**Provisioning.** There is no sign-up or account-creation flow — admin accounts are provisioned directly in the database (see docs/Architecture/System_Architecture.md — Authentication Flow), consistent with "no user management" being out of scope for this module.

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
