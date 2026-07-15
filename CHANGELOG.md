# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.12.0] - 2026-07-25

Sprint UI-2 — Campaign Visual Identity. Purely visual sprint replacing Sprint UI-1's approximated palette with the client's exact supplied brand system: exact hex colors, Fredoka/Inter typography, exact button/input/card specs, and an exact 3-stop hero gradient. No backend, domain, application-logic, API, or database changes; the admin panel is untouched, both visually and in copy.

### Changed

- `.theme-campaign` (`app/globals.css`) rewritten with the client's exact hex palette (Background `#F8FCFF`, Headline `#243B53`, Primary `#8B5CF6`/hover `#7C3AED`, Secondary Blue `#8FD3FF`, borders `#D6EAF8`, etc.) in place of Sprint UI-1's OKLCH approximations. `:root`/`.dark` (admin's tokens) untouched.
- Deliberately no `prefers-color-scheme: dark` variant for `.theme-campaign` (Sprint UI-1 had one) — the brief's "avoid dark interfaces" direction means public pages stay on the light palette regardless of OS preference. Admin's own dark mode is unaffected.
- Added `Inter` (`next/font/google`) as the public body font, bound to `--font-sans` only inside `.theme-campaign`, following the same scoped-variable pattern already used for the Fredoka heading font — admin keeps Geist Sans.
- All public primary/secondary buttons (Registration submit, "Crear la letra", "¡Me encanta! Crear canción", "Quiero otra versión", hero CTA, "Descargar canción") now follow the brief's exact button spec: `h-12`, pill radius, `font-semibold`, soft `shadow-primary/25`, and an exact `#7C3AED` hover via a new `--primary-hover` token (the shared `Button` component's default `hover:bg-primary/80` opacity trick doesn't hit the exact hex, so this is applied per-instance).
- All public text inputs/select/textarea bumped to `h-12`/`rounded-xl`, white (`bg-card`) background, and an exact `focus-visible:border-primary` + `ring-primary/25` focus state, replacing the shared `Input` component's default sizing/ring color per-instance (the shared component itself, used by admin, is untouched).
- Card wrapper radius (`RegistrationSection`, `app/generate/page.tsx`, all three `SongResultView` states) changed from `rounded-3xl` to an explicit `rounded-[24px]` — this codebase's `@theme inline` block scales `rounded-3xl` off `--radius` (`calc(var(--radius) * 2.2)`), so it no longer equals a fixed 24px once `--radius` changed; a soft diffuse `shadow-[0_8px_30px_rgba(139,92,246,0.08)]` was added at the same time, replacing `shadow-sm`.
- Hero section (`HeroSection.tsx`) background replaced with the brief's exact 3-stop gradient (`#F8FCFF → #D9F2FF → #BEE8FF`) and two additional soft blurred decorative circles, on top of the existing blob.
- "Crear letra" → "Crear la letra" (`LyricsGenerationForm.tsx`), matching the brief's updated copy example; the corresponding `LyricsWorkflow.test.tsx` matcher updated from `/crear letra/i` to `/crear la letra/i` (the old regex required "crear" immediately followed by " letra", which no longer matches with "la" in between).
- Added a short reassurance line to the completed-song screen ("También te la enviamos a tu correo...") — one of the brief's listed screens ("Email sent") that had no explicit copy before.
- Fixed a pre-existing bug (not introduced by this sprint, but blocking its own body-font requirement): an unlayered `body { font-family: Arial, Helvetica, sans-serif }` rule in `globals.css` was a direct declaration on `body`, which always wins over an inherited `--font-sans`/`html { @apply font-sans }` value regardless of CSS layers — meaning body text sitewide (admin included) was rendering in Arial, not Geist Sans as intended, this whole time. Removed the hardcoded `font-family`, letting `--font-sans` (Geist for admin, Inter inside `.theme-campaign`) take effect as designed.

### Accessibility

- Two text tiers only (`--foreground`/Headline `#243B53`, `--muted-foreground`/Body `#52667A`), not the three hex values the brief lists — "Muted Text" `#7A8A99` measures ~3.4:1 against Background, under the 4.5:1 WCAG AA floor for normal-sized text, so it's omitted as a text color rather than shipped non-compliant.
- Added a `--destructive-text` token (`#DC2626`) for small error copy — the brief's exact `--destructive` (`#EF4444`) measures ~3.8:1 on white, under the 4.5:1 floor for normal text (though it clears 3:1 for borders/icons, where it's still used).
- Status banners (form/lyrics/song error alerts) changed from colored text on a tinted background to dark body text + a colored left border + tinted background, using new `--destructive-background`/`--success-background` tokens — avoids the contrast failure of colored-text-on-tinted-background while keeping the exact brand hex values as accents.
- Primary buttons are `font-semibold` at `text-base` — white-on-`#8B5CF6` measures ~4.2:1, under 4.5:1 for normal text but clearing 3:1 for bold/large text, so button labels are sized/weighted to qualify.
- Focus-visible states on all public inputs/selects/textareas now show both an exact-color border (`--primary`) and a ring, not just the default ring — a more visible, brand-consistent keyboard-focus indicator than the shared `Input` component's default.

## [1.11.0] - 2026-07-24

Sprint UI-1 — Spanish Localization & Brand Refresh. Purely visual/copy sprint preparing the application for the first customer demo: the complete public experience (Landing, Registration, Lyrics generation/review, Song result, every error/waiting state) is now in Spanish, and the monochrome placeholder palette is replaced with the campaign brand palette (soft blues, white, purple accents — no black buttons). No backend, domain, application-logic, API, or database changes; the admin panel is untouched, both visually and in copy.

### Added

- `.theme-campaign` (`app/globals.css`) — the campaign palette and a warm display font (Fredoka, public headings only), scoped to a single class applied at the root of each public page (`app/page.tsx`, `app/generate/page.tsx`, `app/song/page.tsx`). `:root`'s original tokens — which the admin panel uses via the exact same semantic class names — are untouched, so admin renders byte-for-byte as before; verified directly against the built dev server (`curl` of `/admin/login` shows zero trace of `.theme-campaign` or any copy change).
- A local, frontend-only validation-message translator in `RegistrationForm.tsx`/`LyricsGenerationForm.tsx`, re-translating the finite, fixed-shape set of messages the _shared_ `src/shared/validation/` module (also used server-side, out of scope for this sprint) can produce — without editing that module. Falls back to the original message for anything it doesn't recognize, so a future wording change there degrades gracefully instead of mistranslating.
- Every frontend error-message service (`registerLead.ts`, `generateLyrics.ts`, `approveLyrics.ts`) now prefers a local, Spanish, error-`code`-keyed message unconditionally, ignoring the server's own (English) `message` field entirely — the API itself is untouched; only which of its two already-returned fields the frontend chooses to render changed.

### Changed

- Mood display labels (`LyricsGenerationForm.tsx`) are now Spanish ("Alegre", "Tranquilo", "Juguetón", "Sentimental") — but the underlying `name`/`description` values submitted to `POST /api/lyrics/generate` are deliberately left in English, unchanged, since they flow directly into `GenerateLyricsForLeadUseCase`'s Claude prompt and are persisted on `Lyrics.prompt` server-side; changing them would be an observable backend behavior change from a frontend file, which this sprint's "no backend changes" explicitly rules out.

### Known limitations (accepted, out of scope this sprint)

- A moderation-rejected message's reason (`GenerateLyricsForLeadUseCase`'s Claude response, surfaced verbatim in `LyricsWorkflow.tsx`) remains in whatever language Claude responds in — English, in practice — since translating it would mean changing the Claude prompt itself, a backend change.
- `Mood.sunoPrompt`/`MoodSunoPromptProvider`/`PrismaMoodSunoPromptProvider` keep their pre-existing names (see the 1.10.0 entry above) — unrelated to this sprint, not touched.

## [1.10.0] - 2026-07-23

Final pre-beta provider switch — Mureka replaces Suno as the active production music provider. `MurekaSongService` (built and validated across Gates 9.2–9.5) is now wired into every composition root that runs the generation pipeline; Suno's infrastructure is deleted outright, not left dormant. No architectural change — `MurekaSongService` already satisfied the `SongGenerationProvider` port structurally; this is a one-line swap repeated at each of the four composition roots.

### Changed

- `app/api/lyrics/approve/route.ts`, `app/api/song/generate/route.ts`, `app/api/admin/songs/[songId]/retry/route.ts`, `app/api/internal/pipeline/run/route.ts` — each now constructs `MurekaSongService` instead of `SunoSongService` as the injected `SongGenerationProvider`. Nothing else in any of these routes changed.
- `MurekaSongService` now declares `implements SongGenerationProvider` explicitly (previously satisfied it only structurally, never wired in).
- `Song.create()`'s `DEFAULT_PROVIDER` is now `"mureka"` (was `"suno"`) — every newly created Song is correctly attributed to the provider that will actually generate it.
- `PROJECT_MANIFEST.md` — "Suno API" replaced with "Mureka API" in the Infrastructure list; "Each mood maps to a fixed Suno prompt" generalized to "a fixed generation prompt" (the domain field itself, `Mood.sunoPrompt`, is intentionally left unrenamed — see Technical debt). The "Do not prepare multiple AI providers" / "Single music provider" constraints, previously violated by Suno and Mureka coexisting in the codebase since Gate 9.2, are genuinely honored again now that Suno is gone.

### Removed

- `src/infrastructure/suno/` (`SunoClient`, `PromptBuilder`, `ResponseParser`, `SunoSongService`, `types.ts`) and `tests/infrastructure/suno/` — deleted outright, not left as dormant dead code.
- `SUNO_API_KEY` — removed from `src/config/env.ts`/`src/config/app.ts`, `.env.example`, and every documentation reference. No longer a required environment variable anywhere in the codebase.

### Documentation

- Every "Suno" reference across `docs/`, `README.md`, `BACKLOG_V3.md`, and inline code comments updated to "Mureka" (or, for architecture-agnostic prose, genericized) — including correcting several sections (`docs/Architecture/Domain_Model.md`'s Song state diagram, `docs/Product/User_Flow.md`'s Song Generation Endpoints / Song Result Screen sections, `docs/Architecture/System_Architecture.md`'s External Services list) that had drifted stale from an earlier, pre-Sprint-7.5/9.1 architecture (`PENDING`/`READY` statuses that no longer exist, client-side polling that Sprint 7.5 already removed, a raw provider URL persisted directly that Sprint 9.1 already replaced with the R2 object-key model) — these were pre-existing documentation bugs unrelated to the provider switch, corrected while already touching the same sections.

### Technical debt

- `Mood.sunoPrompt` (the Prisma column), `MoodSunoPromptProvider` (the application-layer port), and `PrismaMoodSunoPromptProvider` (its adapter) keep their Suno-era names — renaming them would require a database migration and touch call sites well beyond this switch's scope ("No architectural changes. No redesign."). Business-rule and architecture prose now says "fixed generation prompt" instead of "fixed Suno prompt" to stay accurate without implying the code identifiers changed too.

### Real validation

- Mureka generation credits confirmed still unavailable at switch time (`GET /v1/account/billing` — a free, read-only check — again returned no balance for this account, consistent with every prior gate's finding). A real submission was not attempted.
- Real, free connectivity/authentication check performed: `GET /v1/account/billing` succeeded with a `200` and the account's real `account_id`, confirming the credentials and network path used by the now-wired-in `MurekaSongService` are live and correct.
- Full pipeline verified with the mocked-provider fallback, but against the **real** production wiring, not an isolated unit: a new integration test (`tests/application/song/MurekaPipelineIntegration.test.ts`) constructs the real `MurekaSongService`/`MurekaClient` (only `fetch` mocked) and drives it through real `GenerationDispatcher`/`GenerationPoller` instances — submit → poll(`ready_to_download`) → download → R2 upload → `COMPLETED` → email, and the terminal-failure path, both passing end-to-end.

## [1.9.0] - 2026-07-22

RC-2 — Production Hardening. Closes every production blocker identified in the RC-1 audit: a Song stuck `GENERATING` could permanently block the campaign's one-concurrent-generation slot with no recovery path, the pipeline only ever advanced inside a user request's `after()` callback with no independent scheduler, `POST /api/admin/login` had none of the abuse protection every public endpoint already had, and `.env.example`/environment docs had drifted out of sync with `src/config/env.ts`. No Version 2 features, no architectural redesign — every change extends an existing mechanism.

### Added

- **Pipeline scheduler**: `GET /api/internal/pipeline/run`, invoked by Vercel Cron every 5 minutes (`vercel.json`), runs `GenerationDispatcher` then `GenerationPoller` exactly once — the same sequence every request-triggered call site already runs, just independent of user traffic. Internal-only: rejects any request without the correct `Authorization: Bearer $CRON_SECRET` header (`verifyInternalSecret`, timing-safe comparison), which Vercel sends automatically once `CRON_SECRET` is configured.
- **Stuck-song recovery**: `GenerationDispatcher` now reclaims a Song stuck `GENERATING` past `GENERATION_TIMEOUT_MINUTES` (new config, default 30) at the start of every run — marks it `FAILED` with a descriptive `providerError`, freeing the slot, then immediately continues with the oldest `QUEUED` song in the same call. No manual database intervention is ever required; the existing admin retry flow picks the reclaimed Song back up exactly like any other `FAILED` song.
- **Admin login protection**: `POST /api/admin/login` gets the exact same abuse-protection treatment every public endpoint already has (Sprint 8.2) — IP-based rate limiting (`MAX_ADMIN_LOGIN_ATTEMPTS_PER_WINDOW`, default 10) and a new `invalid_login_credentials` `SecurityEventRecorder` category for failed attempts, which itself writes an `AuditLog` entry (`adminId: null`, same as every other security event). `LoginUseCase`'s authentication logic itself is untouched — this only wraps it at the route layer, the same place every other route already does rate limiting.
- **Operational health check**: `GET /api/internal/health` (same `CRON_SECRET`) reports database, R2, Resend, and Mureka status independently and in parallel — each check is read-only and side-effect-free (`SELECT 1`; `exists()` on a fixed never-written R2 key; Resend's own `GET /domains`; Mureka's own `GET /v1/account/billing`, the same free endpoint used for live validation in Gate 9.3–9.5). Returns `200` when everything is healthy, `503` if anything isn't, so an external uptime monitor can alert on the status code alone.
- **Documentation sync**: `.env.example` and `docs/Development/Environment.md` now list every environment variable `src/config/env.ts` actually validates (previously missing `MUREKA_API_KEY` and every R2/Turnstile/rate-limit/RC-2 variable), plus README's own copy of the same table and a new Production Deployment note covering `CRON_SECRET` setup. `PROJECT_MANIFEST.md` was reviewed and left unchanged — RC-2 doesn't introduce a new architectural exception beyond the one Sprint 7.5 already documents.

### Correction

- The RC-1 audit's "`SecurityEventRecorder` is dead code" finding was a false negative: the sub-agent that produced it grepped only `src/`, missing the four `app/api/*/route.ts` call sites (`leads`, `leads/session`, `lyrics/approve`, `lyrics/generate`) that were already wiring it in. The only genuine gap was `POST /api/admin/login`, closed above — `SecurityEventRecorder` is now used by every route that does rate limiting, with no remaining gap.

## [1.8.0] - 2026-07-21

Gate 9.5 — Complete End-to-End Song Delivery. The final integration gate: closes the one remaining gap between Gate 9.4's `ready_to_download` handling and Suno's existing `completed` path by sending the "song ready" email after a provider-async completion too. Both paths are now unified into a single, shared terminal-success handler. `GenerationDispatcher`, Mureka submission, Mureka polling, and `CloudflareR2Storage` are all untouched. Mureka still isn't wired into the live pipeline — Suno remains the only active provider.

### Changed

- `GenerationPoller`'s two near-identical terminal-success branches (`completed` and `ready_to_download`) are unified into one private `downloadStoreAndDeliver` method: download → upload to R2 → persist storage key only → mark `COMPLETED` → **send the "song ready" email**. The email is sent strictly after the download, the R2 upload, and the repository `update` (the "committed" moment) have all already succeeded — reusing the existing `SongReadyEmailTemplate`, `ResendEmailService`/`SongEmailSender`, and `AudioUrlResolver` completely unchanged. A fresh signed URL is resolved on demand and never persisted; the email never contains a provider URL, a signed URL, or any other temporary URL.
- `Song.recordProviderStatus` is unchanged from Gate 9.4 (still diagnostics-only for a still-pending poll); no new domain status was introduced — `COMPLETED` continues to mean exactly what it always has.
- **Failure isolation, unchanged in behavior, now exercised by both paths**: a download or upload failure marks the Song `FAILED` and rethrows _before_ the email step is ever reached. An email failure, by contrast, is caught entirely inside the existing `deliverReadyEmail` and never rolls back the already-persisted `COMPLETED` generation — the Song stays `COMPLETED`, the audio stays available, and the existing admin resend-email flow (`ResendSongEmailUseCase`, untouched) remains the recovery path, exactly as it already worked for Suno.

### Added

- Test coverage for the previously-Suno-only guarantees, now also asserted for the `ready_to_download` path: exactly one email sent with a resolved signed URL, the signed URL resolved only through `AudioUrlResolver` and never persisted, and the Song staying `COMPLETED` with its audio intact when the email send fails.
- **Real validation**: with Mureka generation credits still unavailable, the provider step was mocked (a `ready_to_download` result standing in for a Mureka completion), but `GenerationPoller` was run against the **real** `CloudflareR2Storage`, `R2AudioUrlResolver`, and `ResendEmailService` — a genuine end-to-end run of download → R2 upload → persist → `COMPLETED` → real Resend email send, authorized by and sent to the developer's own address. The R2 object was deleted immediately after. Confirmed: the poller returned `outcome: "ready"`, the Song reached `COMPLETED` with only its storage key persisted, the R2 object existed, and the real Resend call completed without error.

## [1.7.0] - 2026-07-20

Gate 9.4 — Audio Download & Storage. Completes the provider pipeline's storage half: on a `ready_to_download` poll result, `GenerationPoller` now downloads the audio and uploads it to Cloudflare R2 via the existing `CloudflareR2Storage` abstraction, exactly like it already does for Suno's synchronous `completed` path. No email is sent for this outcome yet — that remains a future gate's job. `GenerationDispatcher`, Mureka submission, and email delivery are all untouched. Still not wired into the live pipeline — Suno remains the only active provider.

### Added

- `GenerationPoller`'s `ready_to_download` handling now performs the full download → R2 upload → persist-storage-key → mark `COMPLETED` sequence (previously it only recorded diagnostics and returned early, deferring to "a future gate"). Only the storage key (`Song.audioStorageKey`) is ever persisted — never a provider URL, a signed URL, or any other temporary URL, the same invariant Suno's path has always upheld.
- No new domain status was introduced for "the audio is ready." `SongStatus.COMPLETED` already meant exactly that, decoupled from whether an email was ever sent — see the reserved-but-unused `DELIVERED` value in `prisma/schema.prisma` and `SongMapper`'s existing collapse-to-`COMPLETED` comment, both predating this gate. `GenerationPollerResponse.outcome` gains `ready` (replacing the now-unreachable `ready_to_download` outcome) purely as an internal/test-facing signal that audio was stored without an email attempt.
- Retry behavior is unchanged and lives entirely beneath the existing ports: `HttpAudioDownloader` retries transparently via the shared `httpRequest` helper's timeout/retry, and R2 uploads retry via the AWS SDK's built-in retry policy inside `StorageClient`. `GenerationPoller` itself never retries — a download or upload failure is caught, the Song is marked `FAILED` with the error persisted, and the error is rethrown, identical to the existing Suno failure path. A Song is never marked `COMPLETED` unless the R2 upload has already succeeded.
- `Song.recordProviderStatus` simplified: the `{ completed: true }` option (Gate 9.3) is removed as dead code now that a provider-side completion goes straight to `markCompleted` in the same poll, rather than pausing at an intermediate recorded-but-undownloaded state.
- **Cleanup (provider temporary URLs)**: no abstraction was added. Mureka's official OpenAPI spec (confirmed in Gate 9.3) documents no task/audio deletion endpoint for this resource, and its audio URLs already self-expire (documented "valid for 30 days"); building a deletion seam for a capability the provider doesn't expose would be speculative. Revisit if Mureka documents one.
- **Real validation**: one real Mureka generation was not possible — the account's generation credits remain unavailable (`GET /v1/account/billing` returns no balance for this account, consistent with Gate 9.2's real `429 quota_exceeded`). Instead, the storage half was validated for real, at no Mureka cost: a scratch object was uploaded to the live R2 bucket via `CloudflareR2Storage`, its existence confirmed, then deleted and reconfirmed absent — exercising the exact abstraction `GenerationPoller` uses, end-to-end. The full `ready_to_download` → download → upload → `COMPLETED` flow is covered by mocked-provider unit tests.

## [1.6.0] - 2026-07-19

Gate 9.3 — Mureka Polling. Adds provider polling against Mureka's official task-query endpoint. Still not wired into the generation pipeline — `GenerationDispatcher`/`GenerationPoller` continue to run exclusively against `SunoSongService`; this gate only adds the _capability_ to poll Mureka and a new internal `Song`/`GenerationPoller` state (`ready_to_download`) for a provider-side completion that hasn't been downloaded yet. No audio is downloaded, no R2 upload happens, and no email is sent for Mureka in this gate.

### Added

- `MurekaClient.queryTask(taskId)` — `GET https://api.mureka.ai/v1/song/query/{task_id}`, reusing the existing error-mapping (`mapErrorResponse`) shared with `submitGeneration`.
- `ResponseParser.parsePoll(raw)` — Zod-validates Mureka's documented `SongTask` response (confirmed directly against Mureka's own published OpenAPI spec) and maps its `status` enum (`preparing`/`queued`/`running`/`streaming` → pending, `succeeded` → ready-to-download, `failed`/`timeouted`/`cancelled` → failed) into the shared `SongGenerationPollResult`. An unrecognized status defaults to pending rather than throwing. A succeeded task's `choices[0].duration` (documented in milliseconds) is converted to whole seconds, matching this codebase's existing `Song.duration` convention.
- `MurekaSongService.pollGenerationStatus(providerTaskId)` — never throws for an expected failure category: retryable provider hiccups (5xx, rate limiting, a network/timeout failure the shared `httpRequest` helper couldn't recover from) become `{ status: "pending" }`; everything else (bad credentials, exhausted quota, invalid request, a malformed response) becomes `{ status: "failed" }`.
- `SongGenerationPollResult` gains a new `ready_to_download` variant, additive alongside the existing `completed` variant — lets a genuinely asynchronous provider (Mureka) report "the provider itself is done" without retroactively changing `SunoSongService`'s existing synchronous `completed` behavior (still the only variant that triggers `GenerationPoller`'s download/R2-upload/email flow).
- `Song.recordProviderStatus(providerStatus, { completed? })` — a new non-transitioning method that records the provider's latest raw status (and, when the provider itself has finished, stamps `completedAt`) without moving `Song` out of `GENERATING`. Used by `GenerationPoller` for both a still-in-progress poll (diagnostics only) and a `ready_to_download` result.
- `GenerationPoller` now persists `providerStatus` on every still-pending poll (previously a no-op), and handles `ready_to_download` by recording the provider-complete status and returning early — explicitly not touching `AudioDownloader`, `AudioStorage`, `SongEmailSender`, or `EmailDeliveryTracker` for this outcome.
- **Real API validation**: queried the live endpoint for a (necessarily) non-existent task id — a query costs no generation credits regardless of outcome. Mureka returned a real `400` ("invalid payload"), confirming the endpoint URL, bearer-token authentication (not a `401`), and error classification all work end-to-end; `MurekaSongService.pollGenerationStatus` correctly classified it as non-retryable and returned `{ status: "failed" }` without throwing. The success path (`succeeded` → `ready_to_download`) is implemented and unit-tested against Mureka's documented schema but not yet exercised live, since no account-accepted task id exists yet (Gate 9.2's one live submission attempt hit the account's exhausted quota before a task was ever created).

## [1.5.0] - 2026-07-18

Gate 9.2 — Mureka Foundation. Creates the official Mureka async generation client, submission-only. Not wired into the generation pipeline — `GenerationDispatcher`/`GenerationPoller` (Sprint 9.1) still use `SunoSongService`, unchanged. No polling, download, or email implemented for Mureka yet.

### Added

- `src/infrastructure/mureka/` — `MurekaClient` (raw HTTP client for `POST https://api.mureka.ai/v1/song/generate`, built on the shared `httpRequest` helper, the same pattern as `ClaudeClient`/`SunoClient`), `PromptBuilder` (maps the existing `SongGenerationInput` — already-approved lyrics + the Mood's fixed prompt — into Mureka's payload shape, pinning `n: 1` per the "exactly one song per call" business rule), `ResponseParser` (Zod-validates Mureka's response into a structured, already-translated result — no raw Mureka field name ever leaves this module), `MurekaSongService` (orchestrates the three: build payload → call Mureka → parse response).
- `MUREKA_API_KEY` environment variable, read via `appConfig.mureka.apiKey` — never hardcoded, same pattern as `CLAUDE_API_KEY`/`SUNO_API_KEY`.
- Error mapping for Mureka's documented codes: 401 (invalid authentication), 403 (forbidden), 429 — split into `rate_limited` vs `quota_exceeded` by inspecting the response body's message, since both share the same status code — 400 (invalid request), 5xx (server error), plus network/timeout failures via the shared `httpRequest` helper's existing retry-then-throw behavior.
- **Real API validation**: authenticated successfully against the live endpoint and submitted one real generation request. The account's available quota was exhausted, so Mureka returned a real `429` ("You exceeded your current quota..."), which `MurekaClient` correctly classified as `mureka.quota_exceeded` (not misclassified as generic rate-limiting) — confirming the client, authentication, and error-mapping all work correctly end-to-end against the live API. The success path (task acceptance) is implemented and unit-tested but not yet exercised live, pending the account's billing being topped up.

`MurekaSongService` does not implement the `SongGenerationProvider` port yet (mirrors `ClaudeLyricsService`, which also isn't wired into an application-layer port until its own use case exists) — wiring it in, and implementing `pollGenerationStatus`, is a future gate's job.

## [1.4.0] - 2026-07-17

Sprint 9.1 — Generation Pipeline Refinement. Splits provider interaction into a submit phase and a completion-poll phase, and wires Cloudflare R2 storage into the generation pipeline for the first time — preparation for a future Mureka integration (not implemented in this sprint; no external API changed). No business rule or user-visible behavior changed.

### Added

- `GenerationDispatcher` (`src/application/song/use-cases/`) — takes the oldest `QUEUED` Song, submits it to the provider, and persists `providerTaskId`/`providerTraceId`/`submittedAt`, then finishes immediately. Never polls, downloads, stores, or emails. Still enforces `maxConcurrentGenerations = 1` via the existing `findGenerating()` check — no behavior change.
- `GenerationPoller` (`src/application/song/use-cases/`) — finds the Song currently `GENERATING`, asks the provider whether it has finished, and only on completion downloads the audio, uploads it to Cloudflare R2, persists the resulting object key, and delivers the "song ready" email (idempotency unchanged — `EmailDeliveryTracker`'s atomic claim). Replaces `SongGenerationWorker`, which owned the entire submit→wait→download→store→email lifecycle in one call.
- `SongGenerationProvider` contract split into `submitGeneration()`/`pollGenerationStatus()` (was one blocking `generateSong()`), matching how an async, task-based provider actually works. `SunoSongService` implements both without any new network call — Suno's one existing blocking call already returns the finished result, cached in-memory keyed by `providerTaskId` so the poll step can return it without inventing a second call Suno doesn't offer (documented limitation: only works within the same process lifetime as the submit call, which matches this app's current same-request dispatch+poll scheduling).
- `Song` persistence extended with provider metadata: `providerTaskId`, `providerTraceId`, `providerStatus`, `providerError`, `submittedAt`, `completedAt`.
- **Storage model change**: the database now persists only the Cloudflare R2 object key (`Song.audioStorageKey`) — never a signed URL, never a provider URL. Every consumer (the "song ready" email, the parent-facing session endpoint, the admin Lead Detail view, the admin manual resend action, and the legacy `/api/song/[songId]` status endpoint) resolves a fresh signed URL at read time via the new `AudioUrlResolver` port (`R2AudioUrlResolver` wraps the existing, unmodified `CloudflareR2Storage`). `R2_SIGNED_URL_EXPIRY_SECONDS` raised from 5 minutes to 7 days accordingly.
- `AudioUrlResolver` is the documented seam a future `DownloadToken` abstraction (short-lived, app-issued tokens instead of raw R2-signed URLs) will plug into — not implemented in this sprint.

### Removed

- `SongGenerationWorker` and `SongGenerationWorkerResponse` — replaced by `GenerationDispatcher`/`GenerationPoller`.

## [1.3.0] - 2026-07-16

Sprint 8.2 — Abuse Protection. Prevents automated abuse from consuming AI generation budget: Cloudflare Turnstile on every public form, DB-backed rate limiting on every public endpoint, and suspicious-behavior recording. No business rule changed.

### Added

- Cloudflare Turnstile, verified server-side only (`TurnstileClient`/`TurnstileVerifier`, `src/infrastructure/security/turnstile/`) on lead registration and lyrics generation/regeneration (`POST /api/leads`, `POST /api/lyrics/generate`) — a request without a valid token is rejected (403) before any business logic runs. Rendered client-side via `TurnstileWidget` (`src/components/security/`), Cloudflare's plain `api.js` script and explicit render API — no new npm dependency.
- DB-backed sliding-window rate limiting (`RateLimiter`, `RateLimitRepository`/`PrismaRateLimitRepository`, new `rate_limit_events` table — no Redis, no message queue, see PROJECT_MANIFEST.md) on every public endpoint: registration by IP and email, lyrics generation by lead session and IP, lyrics approval by lead session, and the session-polling endpoint (`GET /api/leads/session`) by lead session — all return a friendly 429 ("Too many requests. Please wait a few minutes before trying again.") that never exposes the configured threshold.
- Suspicious-behavior recording (`SecurityEventRecorder`) for rate-limit breaches, invalid Turnstile tokens, and excessive generation attempts — reuses the existing `AuditLog` with a new `adminId: null` variant for system-recorded (non-admin) events, rather than a parallel logging table.
- Every limit and secret now lives in configuration (`appConfig.security`, `src/config/app.ts`/`env.ts`), never hardcoded in a route: `TURNSTILE_SECRET`, `TURNSTILE_SITE_KEY`, `RATE_LIMIT_WINDOW_MINUTES`, `MAX_REGISTRATIONS_PER_IP`, `MAX_REGISTRATIONS_PER_EMAIL`, `MAX_GENERATIONS_PER_HOUR`, `MAX_GENERATIONS_PER_IP_PER_HOUR`, `MAX_APPROVALS_PER_HOUR`, `MAX_SESSION_REQUESTS_PER_WINDOW`, `SESSION_RATE_LIMIT_WINDOW_MINUTES`. Turnstile defaults to Cloudflare's publicly documented "always passes" test keypair so local dev/tests need no secrets; production must override both.
- `getClientIp` (`src/infrastructure/http/`) reads the client IP directly from each route's own `Request` (not the ambient `next/headers()`, which requires a live Next.js request scope) — documented rationale for why `x-forwarded-for`'s first entry is trustworthy on this app's Vercel deployment.

### Changed

- `AuditLog.adminId` is now nullable (Prisma migration `20260716083000_abuse_protection`, additive-only) — a `null` actor represents a system-recorded security event rather than an admin action.

## [1.2.0] - 2026-07-14

Sprint 8.1 — Input Validation & Sanitization. Hardens every user-controlled field (Registration: parent name, baby name, city, email, phone; Lyrics generation: custom message) with a single shared set of validation rules enforced identically by the frontend, the API layer, and the domain layer. No business rule changed.

### Added

- `src/shared/validation/` — the shared Sprint 8.1 hardening module:
  - `text.ts` — `sanitizePlainText()` trims, collapses repeated whitespace, normalizes Unicode (NFC), and rejects control characters, embedded null bytes, HTML angle brackets (`<`/`>`), and values that are empty (after trimming) or exceed the field's `FIELD_LIMITS` ceiling (parent name 100, baby name 60, city 100, email 254, phone 25, lyrics message 600). `describeTextValidationFailure()` maps a failure to a user-friendly message that never exposes implementation details.
  - `email.ts` / `phone.ts` — RFC-shaped email format validation and international phone-number format validation (digit-count bounded to E.164).
  - `zodFields.ts` — Zod schema builders (`plainTextField`, `optionalPlainTextField`, `emailField`, `optionalPhoneField`) built on the functions above, shared by the frontend forms and the API route schemas so both layers enforce identical rules from one source. Domain/application code never imports this file — it uses the framework-agnostic functions directly, preserving the existing Clean Architecture boundary.
- Domain enforcement: `Email`, `PhoneNumber` (`src/domain/lead/value-objects/`) and `Lead.create` (parent name, baby name, city) now apply the shared hardening before their existing format/business checks.
- Application enforcement: `GenerateLyricsForLeadUseCase` sanitizes the custom lyrics message before it reaches the AI provider or is persisted.
- API enforcement: `POST /api/leads` and `POST /api/lyrics/generate` apply the same rules at the boundary via the shared Zod builders, and now surface the first validation issue as a user-friendly 400 message instead of a generic one.
- Frontend enforcement: `RegistrationForm` and `LyricsGenerationForm` reuse the same Zod builders and `FIELD_LIMITS`, and their inputs now carry a matching HTML `maxLength`.

## [1.1.0] - 2026-07-14

Sprint 7.5 — Async Song Generation Architecture. Replaces the synchronous song-generation assumption with a database-backed, provider-agnostic generation pipeline, in preparation for a future migration to Mureka (whose selected plan allows only one concurrent generation).

### Added

- `Song.status` now uses a `QUEUED → GENERATING → COMPLETED/FAILED` vocabulary (renamed from `PENDING`/`READY`) — the only valid generation states, enforced via a Postgres `ALTER TYPE ... RENAME VALUE` migration.
- `SongGenerationWorker` (replaces `ProcessSongGenerationUseCase`): picks the oldest `QUEUED` song, guards against a second concurrent generation via `findGenerating()`, calls the injected `SongGenerationProvider` (replaces `SunoGenerator`), persists the result, and delivers the "song ready" email. Depends only on an application-layer port — no provider-specific logic outside `src/infrastructure/`.
- `SongRepository.findGenerating()` and `findOldestQueued()` — the two new queries the worker needs.
- Approving lyrics (`POST /api/lyrics/approve`) now synchronously creates the queued Song job (`GenerateSongUseCase`) and schedules `SongGenerationWorker` via Next.js's `after()` — it never generates the song inline.
- The Song Result page (`/song`) is now a purely informational waiting page: a single fetch via `GET /api/leads/session` on mount, with no polling and no client-triggered generation. It shows "Your lyrics have been approved. Your song has entered production. We will notify you by email as soon as it is ready." while `QUEUED`/`GENERATING`.
- Admin Dashboard now exposes `Songs Queued` and `Songs Generating` counts alongside the existing indicators.
- `PROJECT_MANIFEST.md` documents a narrow, explicit Architecture exception: a database-backed generation pipeline (state machine + sequential, oldest-first processing) to satisfy the provider's one-concurrent-generation limit — not a message broker, event bus, or pub/sub system, and introduces no new infrastructure component.

### Removed

- `src/features/song/services/generateSong.ts` and `getSongStatus.ts` — dead code once the Result page stopped polling and stopped triggering generation client-side.
- `ProcessSongGenerationUseCase` and the `SunoGenerator` contract (renamed/replaced, see Added).

## [1.0.0] - 2026-07-14

Final Version 1 release. The complete campaign flow — Landing → Lead registration → Lyrics generation/approval → Song generation → Email delivery → Administrator monitoring — is implemented and validated end-to-end.

### Added

- Branded `not-found`/`error` pages and a documented final release audit.

### Changed

- Corrected documentation to match delivered behavior: `docs/Architecture/Domain_Model.md` and `docs/Architecture/Folder_Structure.md` rewritten to reflect the actual implemented structure (previously described a pre-implementation, forward-looking design); `docs/Architecture/System_Architecture.md`, `docs/Architecture/External_Services.md`, and `docs/Product/User_Flow.md` corrected to state that generated audio is referenced directly by Suno's hosted URL rather than mirrored to Supabase Storage; `docs/Architecture/Database_Model.md` annotated to note `GenerationAttempt` is currently unused.
- README rewritten with project overview, architecture summary, prerequisites, installation, environment variables, development, testing, and production deployment sections.

### Fixed

- Removed `src/shared/di/container.ts`, a dead dependency-injection scaffold with zero usages anywhere in the codebase (the project uses plain constructor injection at each route's composition root instead).

### Known Limitations

- Generated audio is served directly from Suno's hosted URL and is not mirrored to owned storage; song availability after the campaign depends on the provider continuing to host the file (see `BACKLOG_V3.md` — Own Audio Storage).
- The `GenerationAttempt` table is defined in the schema but not populated; the five-attempts rule is fully enforced via `Lead.remainingAttempts` alone, so a moderation-rejected attempt that never produced a `Lyrics` row is not shown as an individual event in the Admin execution history (see `BACKLOG_V3.md` — Generation Attempt Audit Trail).
- Automated End-to-End coverage is a single landing-page smoke test; the full registration → lyrics → song → email journey is validated via the mocked unit/integration/API test suite rather than a live browser walkthrough, since exercising it live would require real database and AI-provider credentials (see `BACKLOG_V3.md` — Expand End-to-End Test Coverage).
- `npm audit` reports 5 moderate-severity advisories, all in transitive, build/dev-tool-only dependencies (`prisma`'s bundled `@hono/node-server`, `next`'s bundled `postcss`) with no runtime exposure to campaign visitors; the suggested fixes require downgrading `next`/`prisma` by several major versions and were not applied.

## [0.7.1] - 2026-07-14

### Changed

- Production hardening.
- Performance improvements.
- Security review.
- Dependency cleanup.

## [0.7.0] - 2026-07-14

### Added

- Public Landing Page.
- Campaign information.
- SEO configuration.
- Responsive experience.

## [0.6.2] - 2026-07-14

### Added

- Operational dashboard metrics.
- CSV export.
- Report filters.

## [0.6.1] - 2026-07-14

### Added

- Manual song retry.
- Manual email resend.
- Operational audit history.

## [0.6.0] - 2026-07-14

### Added

- Administration module.
- Secure authentication.
- Dashboard.
- Lead search.
- Read-only detail view.

## [0.5.2] - 2026-07-13

### Added

- Song Result page.
- Automatic email delivery.
- Download workflow.

## [0.5.1] - 2026-07-13

### Added

- Asynchronous song generation.
- Song status endpoint.
- Polling workflow.

## [0.5.0] - 2026-07-13

### Added

- Song module.
- Suno integration.
- Song generation endpoint.

## [0.4.2] - 2026-07-13

### Added

- Lyrics Generation API.
- Lyrics Review interface.
- Lyrics approval flow.

## [0.4.1] - 2026-07-13

### Added

- Claude integration.
- Lyrics generation service.
- Prompt builder.
- Response parser.

## [0.4.0] - 2026-07-13

### Added

- Lyrics domain.
- Lyrics application layer.
- Lyrics repository contract.

## [0.3.4] - 2026-07-13

### Added

- Lead registration UI.
- Registration form validation.
- API integration.

## [0.3.3] - 2026-07-13

### Added

- Lead registration API endpoint.

## [0.3.2] - 2026-07-13

### Added

- Prisma implementation for Lead repository.

## [0.3.1] - 2026-07-13

### Added

- Lead application layer.
- CreateLead use case.

## [0.3.0] - 2026-07-13

### Added

- Lead domain.
- Lead repository contract.
- Lead value objects.

## [0.2.3] - 2026-07-13

### Added

- Initial database schema.
- Entity relationship model.
- Database documentation.

## [0.2.2] - 2026-07-13

### Added

- Centralized configuration layer.
- Environment management.
- Logger abstraction.
- Error handling foundation.
- Dependency injection foundation.

## [0.2.1] - 2026-07-13

### Added

- Design System foundation.
- Theme tokens.
- Base layout components.

## [0.2.0] - 2026-07-13

### Added

- Project initialized.
- Development tooling configured.
- Testing infrastructure configured.

## [0.1.3] - 2026-07-13

### Added

- Documentation consistency review completed.

## [0.1.2] - 2026-07-13

### Added

- Engineering standards documentation.
- Domain documentation.
- External services documentation.

## [0.1.1] - 2026-07-13

### Added

- Product documentation baseline.

## [0.1.0] - 2026-07-13

### Added

- Initial project documentation.
