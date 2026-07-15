# External Services

This document describes every external integration used by the platform: purpose, expected inputs/outputs, failure scenarios, and retry policy.

## Claude API

**Responsibilities**

- Content moderation
- Lyrics generation

**Purpose** — Ensures personalization input is safe before generating creative content, and produces the personalized lyrics shown to the user. Implemented at `src/infrastructure/ai/claude/`.

**Single-Request Design** — Moderation and lyrics generation are **one Claude request**, not two. The prompt (built by `PromptBuilder`) asks Claude to moderate the parent's message against a fixed set of campaign/safety rules and, only if approved, generate the lyrics in the same response. This avoids a second round-trip (and a second cost/latency hit) for the common case where the input is safe.

**Classes:**

- **`ClaudeClient`** — minimal HTTP client for Anthropic's Messages API, built on the shared `httpRequest` helper (`src/shared/http/`) rather than the official SDK, consistent with the project's "no unnecessary abstractions" principle. Adds the `x-api-key` (from `appConfig.claude.apiKey`) and `anthropic-version` headers and posts the model/prompt.
- **`PromptBuilder`** — assembles the system prompt (fixed campaign rules, safety/moderation rules, writing instructions, and the required JSON response format) and the user message (baby name, parent message, selected mood, language). This is the only place those rules are defined.
- **`ResponseParser`** — extracts the text content block from Claude's response, parses it as JSON, and validates it against the expected shape with Zod, including the invariant that an approved result has non-empty lyrics and a rejected result has a non-empty reason.
- **`ClaudeLyricsService`** — orchestrates the three above: build prompt → send message → parse response. Satisfies the Application layer's `LyricsGenerator` port, called by `GenerateLyricsForLeadUseCase` (see `docs/Architecture/System_Architecture.md`).

**Request Flow:**

1. `ClaudeLyricsService.generateAndModerate(input)` calls `PromptBuilder.build` with the baby's name, the parent's message, the selected mood, and the language.
2. `ClaudeClient.sendMessage` posts the resulting system/user prompt to Anthropic's Messages API.
3. `ResponseParser.parse` extracts and validates the response.
4. The caller receives `{ approved, reason, lyrics }` — never a raw Claude payload.

**Response Format** — The prompt requires Claude to return a single JSON object and nothing else (no free text, no markdown fences):

```json
{ "approved": true, "reason": null, "lyrics": "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus" }
```

or

```json
{ "approved": false, "reason": "...moderation reason...", "lyrics": null }
```

When approved, the lyrics follow a fixed structure (Title, Verse 1, Chorus, Verse 2, Final Chorus) sized for roughly 2–3 minutes of music, as plain text.

**Failure Scenarios** — Network errors and timeouts are retried transparently by the shared `httpRequest` helper; once retries are exhausted, or on a non-ok HTTP status, an invalid response body, missing text content, invalid JSON, or a response that doesn't match the expected schema, `ClaudeClient`/`ResponseParser` throw the shared `ExternalApiError` (`src/shared/errors/`) — no raw Claude exception, payload, or stack trace ever escapes the infrastructure layer.

**Retry Policy** — Transient failures (timeout, connection errors, repeated 5xx) are retried a limited number of times with backoff by `httpRequest` (see `src/config/constants.ts`); a non-retryable failure (4xx, malformed JSON, schema mismatch) fails immediately rather than retrying, since retrying the same malformed request would not help. Whether a given failure consumes a lyric attempt is an Application-layer decision, not this layer's (see `docs/Development/Error_Handling.md`).

## Suno API

**Responsibilities**

- Audio generation

**Purpose** — Generates the one final song audio file from the already-approved lyrics and the selected Mood's fixed prompt. Implemented at `src/infrastructure/suno/`. Never regenerates or edits the lyrics — they are passed through exactly as approved.

**Single-Song Design** — Exactly one song is ever generated per call, and — per `Song.leadId` being unique — at most once successfully per lead (see `docs/Product/Business_Rules.md`). No variations, no batch generation.

**Submit/poll contract (Sprint 9.1)** — The application layer's `SongGenerationProvider` port is two calls, `submitGeneration()`/`pollGenerationStatus()` (see "Asynchronous Song Generation" in `docs/Architecture/System_Architecture.md`), matching how an async, task-based provider actually works. Suno's own generation call is synchronous — one HTTP request already returns the finished result — so `SunoSongService` satisfies the two-call contract by caching the already-known result in memory, keyed by `providerTaskId`, rather than inventing a second network call Suno doesn't offer. This only works within the same process lifetime as the submit call (true for this app's current same-request dispatch-then-poll scheduling); a genuinely async provider's future adapter would poll a real remote endpoint instead.

**Classes:**

- **`SunoClient`** — minimal HTTP client for Suno's generation endpoint, built on the shared `httpRequest` helper (`src/shared/http/`) rather than a vendor SDK, consistent with the Claude integration and the project's "no unnecessary abstractions" principle. Adds a bearer token (from `appConfig.suno.apiKey`).
- **`PromptBuilder`** — builds the request payload from the approved lyrics text, the mood's name, and the mood's fixed Suno prompt; derives a title from the lyrics' first line (the same convention the Lyrics Review UI uses).
- **`ResponseParser`** — validates Suno's response with Zod into `{ providerSongId, audioUrl, duration }`.
- **`SunoSongService`** — implements `SongGenerationProvider`: `submitGeneration` builds the payload, calls Suno, parses the response, and caches it; `pollGenerationStatus` returns the cached result.

**Request Format** — `{ prompt, lyrics, tags, title }`, where `prompt` is the mood's fixed Suno prompt (not a general "describe the song" field), `lyrics` is the approved text verbatim, and `tags` carries the mood name. Suno does not publish a single canonical, versioned public API the way Anthropic does; this shape follows the commonly documented "custom mode" generation contract and should be verified against Suno's own current API documentation before this integration is pointed at production traffic.

**Response Format** — `{ id: string, audio_url: string, duration?: number }`. `id` becomes `providerTaskId` on submission; the same response's `audio_url`/`duration` are handed to `GenerationPoller` once it polls — `SunoSongService` never persists `audio_url` itself (see Cloudflare R2, below).

**Failure Handling** — Network errors and timeouts are retried transparently by the shared `httpRequest` helper; once retries are exhausted, or on a non-ok HTTP status, an invalid response body, or a response that doesn't match the expected schema, `SunoClient`/`ResponseParser` throw the shared `ExternalApiError` — no raw Suno exception, payload, or stack trace ever escapes the infrastructure layer. At the Application layer, a Suno failure marks the `Song` `FAILED` (not stuck `GENERATING`) so the _same_ row can be retried later without ever creating a second row for that lead.

**Retry Policy** — Transient failures (timeout, connection errors, repeated 5xx) are retried a limited number of times with backoff by `httpRequest`; a non-retryable failure (4xx, malformed response) fails immediately. Song generation failures never consume a lyric attempt (that budget only governs lyrics generation — see `docs/Product/Business_Rules.md`).

## Mureka API

**Responsibilities**

- Audio generation (future replacement for Suno)

**Purpose** — The official, provider-published async music generation API (Gate 9.2 — Mureka Foundation; Gate 9.3 — Mureka Polling). Implemented at `src/infrastructure/mureka/`. **Not yet wired into the generation pipeline** — `GenerationDispatcher`/`GenerationPoller` (see "Asynchronous Song Generation" in `docs/Architecture/System_Architecture.md`) still use `SunoSongService` exclusively; submission and polling are both implemented and unit-tested, but `MurekaSongService` is not called from anywhere at runtime yet.

**Classes:**

- **`MurekaClient`** — minimal HTTP client for Mureka's official endpoints, built on the shared `httpRequest` helper (`src/shared/http/`) rather than a vendor SDK or an unofficial wrapper, consistent with every other provider integration. Adds a bearer token (from `appConfig.mureka.apiKey`). `submitGeneration` calls `POST /v1/song/generate`; `queryTask` (Gate 9.3) calls `GET /v1/song/query/{task_id}`, sharing the same error-mapping.
- **`PromptBuilder`** — builds the request payload from the same `SongGenerationInput` `SunoSongService`'s own `PromptBuilder` consumes (already-approved lyrics, the Mood's fixed prompt); pins `n: 1` to enforce "exactly one song per call" (see `docs/Product/Business_Rules.md` — Song Rules) and `model: "auto"` per Mureka's own quickstart example.
- **`ResponseParser`** — `parse` validates Mureka's submission response with Zod into `{ providerTaskId, providerTraceId, submittedAt, providerStatus }`. `parsePoll` (Gate 9.3) validates Mureka's task-query response against its documented `SongTask` schema and maps it directly into the shared `SongGenerationPollResult` (`preparing`/`queued`/`running`/`streaming` → pending, `succeeded` → `ready_to_download`, `failed`/`timeouted`/`cancelled` → failed, unrecognized → pending). Mureka's raw field names never escape this class; a succeeded choice's `duration` (documented in milliseconds) is converted to whole seconds to match `Song.duration`'s convention.
- **`MurekaSongService`** — orchestrates the classes above: build payload → call Mureka → parse response, for both submission and polling. `pollGenerationStatus` (Gate 9.3) never throws for an expected failure category — retryable errors (5xx, rate limiting, an unrecovered network/timeout failure) become `{ status: "pending" }`; everything else (bad credentials, exhausted quota, invalid request, a malformed response) becomes `{ status: "failed" }`. Does not implement the application-layer `SongGenerationProvider` port yet (mirrors `ClaudeLyricsService`, not wired into a port until its own use case exists).

**Request Format** — `POST https://api.mureka.ai/v1/song/generate`, `{ lyrics, model, prompt, n }`. `GET https://api.mureka.ai/v1/song/query/{task_id}` takes no body.

**Response Format** — Submission: `{ id, created_at, model, status, trace_id }`; `created_at` is a Unix timestamp in seconds. Query (Mureka's documented `SongTask` schema): `{ id, created_at, finished_at, model, status, failed_reason?, choices? }`, where `status` is one of `preparing`/`queued`/`running`/`streaming`/`succeeded`/`failed`/`timeouted`/`cancelled`, and `choices` (present only once `status` is `succeeded`) is an array of `{ index, id, url, flac_url, wav_url, stream_url, duration, lyrics_sections }` — `url` is valid for 30 days and `duration` is in milliseconds.

**Failure Handling** — `MurekaClient` maps Mureka's documented error codes to the shared `ExternalApiError` taxonomy: 401 (invalid authentication), 403 (forbidden), 429 — split into `rate_limited` vs. `quota_exceeded` by inspecting the response body's message, since Mureka uses the same status code for both — 400 (invalid request), and 5xx (server error). Network errors and timeouts are retried transparently by `httpRequest`, same as every other provider. `MurekaSongService.pollGenerationStatus` (Gate 9.3) additionally re-classifies these into retryable (→ pending, so `GenerationPoller` just asks again) vs. non-retryable (→ failed) outcomes, so a polling caller only ever needs to handle `SongGenerationPollResult`, never an exception.

**Live validation** — Gate 9.2: authentication and the request/response cycle were confirmed against the real submission endpoint; the account's available quota was exhausted, so Mureka returned a real `429` ("You exceeded your current quota..."), correctly classified as `mureka.quota_exceeded`. Gate 9.3: the query endpoint was validated live against a (necessarily) non-existent task id — a query costs no generation credits — confirming the endpoint URL, bearer-token authentication (not a `401`), and error classification all work end-to-end; Mureka returned a real `400` ("invalid payload"), and `pollGenerationStatus` correctly classified it as non-retryable, returning `{ status: "failed" }` without throwing. Neither gate's success path (task acceptance / `succeeded` → `ready_to_download`) has been exercised live yet, since no account-accepted task id exists (the one live submission attempt hit the exhausted quota before a task was ever created).

## Supabase

**Responsibilities**

- PostgreSQL

**Purpose** — Primary relational database (via Prisma) for all domain records (Lead, Lyrics, Song, Campaign, Mood, GenerationAttempt).

**Note on scope** — `PROJECT_MANIFEST.md` lists Supabase Authentication as available infrastructure, but it is not exercised by the delivered V1 flow: the Admin panel uses its own signed-session-cookie authentication (see `docs/Architecture/System_Architecture.md` — Authentication Flow), not Supabase Auth. Object storage for generated audio is Cloudflare R2, not Supabase Storage — see below.

**Expected Inputs** — Reads/writes from repository implementations.

**Expected Outputs** — Persisted/retrieved domain records.

**Failure Scenarios** — Connection failure, constraint violation.

**Retry Policy** — Retry transient connection failures a limited number of times; constraint violations (e.g. duplicate email) are not retried — they are translated into the corresponding business error.

## Cloudflare R2

**Responsibilities**

- Private object storage for generated audio

**Purpose** — S3-compatible object storage for the platform's generated song files. Implemented at `src/infrastructure/storage/`. The bucket is **never publicly exposed** — there is no public bucket URL or public-access configuration anywhere in this integration; every read goes through a short-lived, presigned URL generated on demand.

**Classes:**

- **`StorageClient`** — minimal wrapper around the official `@aws-sdk/client-s3` `S3Client` (plus `@aws-sdk/s3-request-presigner` for signing), configured with `R2_ENDPOINT` (never built from the account ID in code), credentials, and bucket, all from `appConfig.storage`. Exposes the raw `putObject`/`headObject`/`deleteObject`/presigned-URL SDK calls, nothing else.
- **`CloudflareR2Storage`** — orchestrates the client into the four supported operations: `upload`, `generateSignedDownloadUrl` (a presigned `GetObjectCommand` URL, expiring after `R2_SIGNED_URL_EXPIRY_SECONDS` — see `src/config/constants.ts`), `delete`, `exists`. Translates any SDK failure into the shared `ExternalApiError` — no raw AWS SDK exception ever escapes the infrastructure layer.

**Current wiring (Sprint 9.1; Gate 9.4 — Audio Download & Storage)** — `GenerationPoller` downloads the provider's audio from its own (short-lived) URL and uploads it here, persisting only the resulting object key on `Song.audioStorageKey` — never a signed URL, never the provider's URL. This is now the same code path for both providers: Suno's synchronous `completed` result and an async provider's `ready_to_download` result (Mureka, not yet wired into the live pipeline) both trigger identical download → upload → `COMPLETED` handling — the only difference is that `ready_to_download` skips the "song ready" email (a future gate's job). Every consumer that needs to show or email the audio (the "song ready" email, the parent-facing session endpoint, the admin Lead Detail view, the admin manual resend action, the legacy `/api/song/[songId]` status endpoint) resolves a fresh signed URL at read time through `AudioUrlResolver`/`R2AudioUrlResolver` — none of them ever reads or persists a URL directly. `R2_SIGNED_URL_EXPIRY_SECONDS` (`src/config/constants.ts`) is set long enough (7 days) for an emailed link to still work well after generation, not just for a URL resolved and used within the same request.

**Failure Scenarios** — Invalid credentials, bucket permission errors, network failure.

**Retry Policy** — None beyond what the AWS SDK itself performs by default; this integration does not add its own retry loop.

**Live validation (Gate 9.4)** — With Mureka generation credits unavailable, a real end-to-end generation wasn't possible; the storage half was instead validated directly against the live bucket: a scratch object was uploaded via `CloudflareR2Storage.upload`, confirmed present via `exists`, then removed via `delete` and reconfirmed absent — the exact abstraction `GenerationPoller` calls, exercised for real at no Mureka cost.

## Resend

**Responsibilities**

- Transactional emails

**Purpose** — Delivers the one-time "song ready" email to the lead once their Song reaches `COMPLETED`. Implemented at `src/infrastructure/email/`.

**Classes:**

- **`ResendClient`** — minimal HTTP client for Resend's email-sending endpoint, built on the shared `httpRequest` helper (`src/shared/http/`) rather than the official SDK, consistent with the Claude/Suno integrations. Adds the bearer token (from `appConfig.resend.apiKey`) and posts the `from`/`to`/`subject`/`html` payload.
- **`SongReadyEmailTemplate`** — builds the fixed subject ("Your personalized song is ready!") and a responsive, table-based, inline-styled HTML body (greeting, thank-you message, campaign branding, a direct "Play the song" button, a direct "Download the song" button, support contact, footer). Both buttons link straight to the stored `audioUrl` — this integration never proxies or re-serves the file itself.
- **`ResendEmailService`** — implements the application layer's `SongEmailSender` port; orchestrates building the template and calling the client, the same "build payload → call provider" shape as `SunoSongService`.

**Trigger & Idempotency** — Email delivery is driven from `ProcessSongGenerationUseCase` (`src/application/song/use-cases/`), on the one transition that ever reaches `READY` (`GENERATING -> READY`). Exactly one email is guaranteed per Song via `PrismaEmailDeliveryTracker` (`src/infrastructure/persistence/prisma/song/`), which claims delivery through a single atomic, conditional `UPDATE songs SET "emailedAt" = now() WHERE id = $1 AND "emailedAt" IS NULL`. Only the caller that flips this row (`count === 1`) is allowed to call `ResendEmailService`; every other caller — including a background job that somehow ran twice for the same song — sees `count === 0` and must not send. A failure inside the email step (Resend unavailable, malformed lead data, etc.) is caught and logged, never rethrown: by that point Suno already succeeded, and `Song`'s state machine has no `READY -> FAILED` transition, so an email failure must never be allowed to look like a generation failure.

**Expected Inputs** — Recipient email, parent/baby name, the Song's `audioUrl` and `duration`.

**Expected Outputs** — Delivery confirmation/status from Resend (not otherwise surfaced to the user — the email is fire-and-forget from the user's perspective).

**Failure Scenarios** — Delivery failure, invalid recipient, service outage, an invalid response body.

**Retry Policy** — Transient network failures are retried transparently by the shared `httpRequest` helper, same as Claude/Suno; on persistent failure the error is logged for admin follow-up rather than blocking or retrying the user-facing flow — and, per the idempotency mechanism above, the claim is not released, so a persistently-failed send is not retried automatically either (this campaign has no queue/worker to schedule such a retry — see "Why This Project Intentionally Avoids" in `docs/Architecture/System_Architecture.md`).

## Vercel

**Responsibilities**

- Hosting

**Purpose** — Hosts and deploys the single Next.js application.

**Expected Inputs** — Application build/deployment.

**Expected Outputs** — Publicly reachable, deployed application.

**Failure Scenarios** — Build failure, deployment failure, platform outage.

**Retry Policy** — Deployment failures are addressed by fixing the underlying build/config issue and redeploying; no automatic retry of a broken build.

## Cloudflare

**Responsibilities**

- DNS

**Purpose** — Resolves the campaign domain to the Vercel-hosted application.

**Expected Inputs** — DNS configuration for the campaign domain.

**Expected Outputs** — Correct domain resolution to the application.

**Failure Scenarios** — Misconfiguration, propagation delay, outage.

**Retry Policy** — Not applicable at the application level; DNS issues are resolved via configuration correction.
