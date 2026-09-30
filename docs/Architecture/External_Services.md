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
- **`ClaudeLyricsService`** — orchestrates the three above: build prompt → send message → parse response. Satisfies the Application layer's `LyricsGenerator` port, called by `GenerateLyricsForLeadUseCase` (see `docs/Architecture/System_Architecture.md`). Also owns the call budget and both kinds of targeted repair (see "Targeted repair" below).
- **`moderationCategories`** (Sprint FINAL-4) — the internal moderation vocabulary, one value per rule already present in `PromptBuilder`'s `SAFETY_RULES`, plus `PUBLIC_MODERATION_REASON`, the single generic Spanish message a parent ever sees for a rejection.

**Request Flow:**

1. `ClaudeLyricsService.generateAndModerate(input)` calls `PromptBuilder.build` with the baby's name, the parent's message, the selected mood, and the language.
2. `ClaudeClient.sendMessage` posts the resulting system/user prompt to Anthropic's Messages API.
3. `ResponseParser.parse` extracts and validates the response.
4. The caller receives `{ approved, reason, lyrics }` — never a raw Claude payload, and never the internal `moderationCategory`.

**Targeted repair (Sprint FINAL-4 — Targeted Lyrics Repair)** — A single request may spend at most **3 Claude calls in total** (`MAX_CLAUDE_CALLS_PER_REQUEST`), one budget shared by every kind of call, so generations and repairs can never multiply. The calls after the first are aimed at the specific problem rather than repeating the same prompt:

- **Lyrics over the 360-character maximum** — the draft is still in memory inside the raw response, so the next call asks Claude to _edit that draft_ into the 280–320 target window (`PromptBuilder.buildLengthRepair`). A repair that is still too long is repaired again from the most recent draft, never from the original. `ResponseParser` remains the only authority on the limit; the target window is prompt guidance, not a second rule. See "Length control" below for why the window moved down from 340–360 in Sprint FINAL-8.
- **Moderation rejection** — Claude names the rule it applied in `moderationCategory`, and exactly one directed call (`PromptBuilder.buildModerationRepair`) asks for the same song with that element left out. It runs the full, unmodified `SAFETY_RULES` again and may reject again, which ends the request: there is never a second moderation repair.

Neither repair is persisted anywhere: the draft and the parent's message live in memory for the request and are then gone. Every repair is a real Claude call and is recorded as its own `GenerationAttempt` row.

**Public vs internal on a rejection** — `moderationCategory` is internal: it steers the repair and is written to `generation_attempts.failureReason` so the campaign team can group rejections (before this, 21 rejections in one day produced 20 different free-text strings). What the parent receives is always `PUBLIC_MODERATION_REASON` — fixed Spanish, no category, no mention of policies or moderation, no echo of what they wrote. That substitution happens in `ClaudeLyricsService`, in code, rather than relying on the model to follow an instruction; the model had demonstrably drifted, answering 11 of 21 rejections in English to an all-Spanish campaign.

**Response Format** — The prompt requires Claude to return a single JSON object and nothing else (no free text, no markdown fences):

```json
{ "approved": true, "reason": null, "lyrics": "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus" }
```

or

```json
{
  "approved": false,
  "reason": "...moderation reason...",
  "lyrics": null,
  "moderationCategory": "RELIGIOUS_PROPAGANDA"
}
```

`moderationCategory` (Sprint FINAL-4) names which existing safety rule was applied. It adds no rule and changes none: the values are generated from `MODERATION_CATEGORY_RULES`, which restates the `SAFETY_RULES` bullets one for one. The field stays optional in the schema, and `toModerationCategory` resolves it to one of four outcomes:

| What Claude sent                             | Resolves to            | Repaired?                                                        |
| -------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| A known category (`RELIGIOUS_PROPAGANDA`, …) | that category          | Yes                                                              |
| `OTHER_UNSAFE_CONTENT`, explicitly           | `OTHER_UNSAFE_CONTENT` | Yes — it is a real rule, the catch-all the safety rules end with |
| Nothing at all                               | `null`                 | No                                                               |
| Something unrecognised                       | `null`                 | No                                                               |

`null` is deliberately not the same as `OTHER_UNSAFE_CONTENT`: the category is what a repair aims at, so without one there is nothing to correct and the repair would be a paid call asking Claude to remove something neither side can name. An unresolvable label therefore costs the repair, never the response — parsing still succeeds, the parent still gets `PUBLIC_MODERATION_REASON`, and the attempt is still recorded (as `UNCATEGORISED — <the model's own wording>`, so the gap is visible rather than disguised as a category).

When approved, the lyrics follow the fixed four-section commercial-jingle structure (`[Verse] [Verse] [Chorus] [Ending]`, Sprint v1.5), as plain text, sized for a short jingle rather than a full-length song — see "Length control" immediately below.

**Length control (Sprint FINAL-8 — Lyrics Length Control)**

`LYRICS_MAX_LENGTH = 360` is a hard maximum and the single source of truth for it: declared once in `ResponseParser`, imported by `PromptBuilder`, never restated as a literal. It is a production constraint, not a stylistic one — the finished song is cut to a fixed duration, so a longer lyric yields a song whose ending is never heard. Nothing accepts a lyric over it and nothing truncates one to fit.

Alongside it, `PromptBuilder` exports a target window, `LYRICS_TARGET_MIN_LENGTH`–`LYRICS_TARGET_MAX_LENGTH` (**280–320**), which every prompt in the file aims at — the first generation and the length repair alike. It is prompt guidance only; no validation rule refers to it.

Why the window sits well below the maximum. Measured on 2026-09-30 over the 854 calls recorded since tracing began (2026-09-29 04:40):

| Population                                                   |   n | Detail                                                                   |
| ------------------------------------------------------------ | --: | ------------------------------------------------------------------------ |
| Calls that produced a usable lyric (`SUCCESS`)               | 403 | length p50 330, p90 352, max 360, min 257 — and **255 of them over 320** |
| Calls discarded for exceeding 360 (`CLAUDE_OUTPUT_TOO_LONG`) | 378 | mean 418; ~31% of them over by 20 characters or less                     |
| Moderation rejections                                        |  70 | not a length outcome                                                     |
| Rows still `STARTED`                                         |   3 | request died mid-call                                                    |

378 of 781 length-relevant calls — **48.4%** — were discarded, at a cost of **2.12 calls per usable lyric**. The maximum was sitting near the median of the model's own output for this prompt, so roughly half of every generation fell on the wrong side of it.

The cause was not a missing instruction. `WRITING_INSTRUCTIONS` stated the 360 limit four times and required an internal count before responding. The same block also ranked compactness **last of five** creative priorities and said in as many words never to "cut the story itself down to fit" — so whenever the parent's message and the limit collided, the prompt itself instructed Claude to keep the message. Sprint FINAL-8 therefore changed the logic rather than adding another reminder:

- The maximum is stated as a technical constraint that sits **outside** the creative priority order and never trades against it; the remaining priorities are sing naturally → land emotionally → tell one small complete story → be memorable, and a conflict is resolved by carrying less of the parent's message.
- The parent's message is described as **source material, not a script**: covering it is explicitly not a goal, and Claude is told to choose the one or two most emotionally telling details and leave the rest out.
- Length is reached by **dropping whole details**, never by clipped phrasing, abbreviations or a truncated line.
- The repair prompt names the size of the cut outright — "removing at least N characters, about X% of what is there" — and states that landing just under 360 is a failed edit. The superseded 340–360 target aimed the repair 20 characters from the limit it was escaping, which produced ~5–8% reduction per pass (422 → 397 → 385) and exhausted the budget just short of success.

What did **not** change: the maximum (still 360), the parent's 600-character story limit, the model, `max_tokens`, the call budget, and the music pipeline. The audit refuted the story as the driver — over a matched population, calls from stories of ≤150 characters were too long 41% of the time against 44% for stories of 451–600, with no monotonic trend — so nothing was taken away from what a parent may write.

**Per-call metrics** — `ClaudeLyricsService` emits one structured `logger.info("claude.lyrics_call", …)` line per real Claude call, carrying `leadId`, `call`/`maxCalls`, `kind` (`generation` | `length_repair` | `moderation_repair`), `parentMessageLength`, `promptLength`, `outputLength`, `durationMs`, `result` and `errorCode`. Sizes and outcomes only — no lyric, no prompt, no parent message, and no fragment of any of them, the same rule `toLyricsAttemptFailureReason` applies to the database. Emitting these needed no migration and none was run.

This closes the two gaps the audit hit: `GenerationAttempt` records an over-long length only because it appears in the failure message this codebase writes, records nothing at all about a _successful_ call's size, and a lead whose every call failed leaves no `lyrics` row and therefore no trace of the story it was given. Putting the four numbers in a column instead would mean a migration on a campaign with weeks left to run, for data that is answerable from logs. If the campaign later wants them joinable, the change is four nullable `Int` columns on `generation_attempts` (`parentMessageLength`, `promptLength`, `outputLength`, plus a `callNumber` distinct from the lifetime `attemptNumber`) — additive, no backfill, no data loss.

**Cost: what is bounded and what is not** — One request spends at most 3 Claude calls. That ceiling is per _request_, not per lead: a request that exhausts the budget on over-long lyrics throws, and `GenerateLyricsForLeadUseCase` consumes the parent's functional attempt only _after_ the provider returns — so an internal failure costs the parent nothing and they may ask again, spending up to 3 more calls, with no lifetime limit. Leads with 10 and 12 recorded calls exist for this reason.

This was audited in Sprint FINAL-8 and deliberately left as it is. Every available bound — a lifetime call cap per lead, or charging a functional attempt for a length failure — penalises a parent for a defect on our side, and the campaign has no business rule stating how many of our own failures a family should absorb; inventing one was out of scope. The fix applied instead was to stop producing over-long lyrics. **The residual risk is that a family hitting a persistent generation failure can drive unbounded Claude spend by retrying.** The `claude.lyrics_call` metrics above are what will show whether it remains material once the retargeted prompt is live; if the discard rate does not fall, a lifetime cap becomes a product decision to take deliberately rather than a rule to guess at.

**Failure Scenarios** — Network errors and timeouts are retried transparently by the shared `httpRequest` helper; once retries are exhausted, or on a non-ok HTTP status, an invalid response body, missing text content, invalid JSON, or a response that doesn't match the expected schema, `ClaudeClient`/`ResponseParser` throw the shared `ExternalApiError` (`src/shared/errors/`) — no raw Claude exception, payload, or stack trace ever escapes the infrastructure layer.

**Retry Policy** — Transient failures (timeout, connection errors, repeated 5xx) are retried a limited number of times with backoff by `httpRequest` (see `src/config/constants.ts`); a non-retryable failure (4xx, malformed JSON, schema mismatch) fails immediately rather than retrying, since retrying the same malformed request would not help. Whether a given failure consumes a lyric attempt is an Application-layer decision, not this layer's (see `docs/Development/Error_Handling.md`).

## Mureka API

**Responsibilities**

- Audio generation

**Purpose** — The official, provider-published async music generation API, and the sole active music provider for the live pipeline (switched from Suno in the final pre-beta provider swap; see PROJECT_MANIFEST.md). Implemented at `src/infrastructure/mureka/`. Generates the one final song audio file from the already-approved lyrics and the selected Mood's fixed prompt. Never regenerates or edits the lyrics — they are passed through exactly as approved.

**Single-Song Design** — Exactly one song is ever generated per call (`n: 1`), and — per `Song.leadId` being unique — at most once successfully per lead (see `docs/Product/Business_Rules.md`). No variations, no batch generation.

**Submit/poll contract** — The application layer's `SongGenerationProvider` port is two calls, `submitGeneration()`/`pollGenerationStatus()` (see "Asynchronous Song Generation" in `docs/Architecture/System_Architecture.md`), matching how Mureka — a genuinely async, task-based provider — actually works: `GenerationDispatcher` submits and gets back a task id immediately; `GenerationPoller` polls that task id on a later run until it reaches a terminal state (`ready_to_download` or `failed`).

**Classes:**

- **`MurekaClient`** — minimal HTTP client for Mureka's official endpoints, built on the shared `httpRequest` helper (`src/shared/http/`) rather than a vendor SDK or an unofficial wrapper, consistent with every other provider integration. Adds a bearer token (from `appConfig.mureka.apiKey`). `submitGeneration` calls `POST /v1/song/generate`; `queryTask` calls `GET /v1/song/query/{task_id}`, sharing the same error-mapping. `getAccountBilling` (RC-2 — Production Hardening) calls the free, read-only `GET /v1/account/billing` — used only by `HealthCheckService` for `GET /api/internal/health`, never in the generation pipeline.
- **`PromptBuilder`** — builds the request payload from the approved lyrics text and the Mood's fixed prompt; pins `n: 1` to enforce "exactly one song per call" (see `docs/Product/Business_Rules.md` — Song Rules) and `model: "mureka-9"`, an explicit model version from the request schema's own list of valid values, so every song is generated by the same known model instead of whichever one `auto` happens to resolve to.
- **`ResponseParser`** — `parse` validates Mureka's submission response with Zod into `{ providerTaskId, providerTraceId, submittedAt, providerStatus }`. `parsePoll` validates Mureka's task-query response against its documented `SongTask` schema and maps it directly into the shared `SongGenerationPollResult` (`preparing`/`queued`/`running`/`streaming` → pending, `succeeded` → `ready_to_download`, `failed`/`timeouted`/`cancelled` → failed, unrecognized → pending). Mureka's raw field names never escape this class; a succeeded choice's `duration` (documented in milliseconds) is converted to whole seconds to match `Song.duration`'s convention.
- **`MurekaSongService`** — implements the application layer's `SongGenerationProvider` port, orchestrating the classes above: build payload → call Mureka → parse response, for both submission and polling. `pollGenerationStatus` never throws for an expected failure category — retryable errors (5xx, rate limiting, an unrecovered network/timeout failure) become `{ status: "pending" }`; everything else (bad credentials, exhausted quota, invalid request, a malformed response) becomes `{ status: "failed" }`.

**Request Format** — `POST https://api.mureka.ai/v1/song/generate`, `{ lyrics, model, prompt, n }`, where `prompt` is the Mood's fixed prompt (not a general "describe the song" field) and `lyrics` is the approved text verbatim. `GET https://api.mureka.ai/v1/song/query/{task_id}` takes no body.

**Response Format** — Submission: `{ id, created_at, model, status, trace_id }`; `created_at` is a Unix timestamp in seconds. Query (Mureka's documented `SongTask` schema): `{ id, created_at, finished_at, model, status, failed_reason?, choices? }`, where `status` is one of `preparing`/`queued`/`running`/`streaming`/`succeeded`/`failed`/`timeouted`/`cancelled`, and `choices` (present only once `status` is `succeeded`) is an array of `{ index, id, url, flac_url, wav_url, stream_url, duration, lyrics_sections }` — `url` is valid for 30 days and `duration` is in milliseconds.

**Failure Handling** — `MurekaClient` maps Mureka's documented error codes to the shared `ExternalApiError` taxonomy: 401 (invalid authentication), 403 (forbidden), 429 — split into `rate_limited` vs. `quota_exceeded` by inspecting the response body's message, since Mureka uses the same status code for both — 400 (invalid request), and 5xx (server error). Network errors and timeouts are retried transparently by `httpRequest`, same as every other provider. `MurekaSongService.pollGenerationStatus` additionally re-classifies these into retryable (→ pending, so `GenerationPoller` just asks again) vs. non-retryable (→ failed) outcomes, so a polling caller only ever needs to handle `SongGenerationPollResult`, never an exception. At the Application layer, a non-retryable failure marks the `Song` `FAILED` (not stuck `GENERATING`) so the _same_ row can be retried later without ever creating a second row for that lead — and `GenerationDispatcher` itself reclaims a Song stuck `GENERATING` past `GENERATION_TIMEOUT_MINUTES` (RC-2 — Production Hardening), so a lost or dropped poll can never block the queue forever.

**Retry Policy** — Transient failures (timeout, connection errors, repeated 5xx) are retried a limited number of times with backoff by `httpRequest` (see `src/config/constants.ts`). Song generation failures never consume a lyric attempt (that budget only governs lyrics generation — see `docs/Product/Business_Rules.md`).

**Live validation** — Authentication and the request/response cycle were confirmed against the real submission endpoint (the account's available quota was exhausted at the time, so Mureka returned a real `429`, correctly classified as `mureka.quota_exceeded`) and against the query endpoint (a real `400` for a non-existent task id, correctly classified as non-retryable). See CHANGELOG.md for the most recent validation performed at the time the provider switch itself shipped.

## Google Lyria (Gemini Developer API)

**Responsibilities**

- Audio generation — the campaign's second, switchable music provider

**Purpose** — Generates the song audio as an alternative to Mureka, selectable per campaign from the Admin panel. Implemented at `src/infrastructure/lyria/`. Receives the _same_ creative input Mureka receives (the shared `MUREKA_STYLE` plus the approved lyrics, byte for byte) so the two providers can be compared on equal terms; it never gets its own prompt variant, and it never alters the approved lyrics.

**Synchronous, unlike Mureka** — Google's Interactions API is single-turn: `client.interactions.create({ model: "lyria-3.5", input })` returns the finished audio inline as base64, with no task id and no polling endpoint. The application's `SongGenerationProvider` port models this explicitly with an `immediate` submission result (Mureka returns `async`), and `GenerationDispatcher` completes such a song in the same invocation through the shared `SongCompletionService`. Nothing is forced to look asynchronous.

**Classes:**

- **`LyriaClient`** — the only integration in this codebase built on a vendor SDK (`@google/genai`) rather than the shared `httpRequest` helper, and deliberately so: the SDK owns the `x-goog-api-key` header, keeping the credential out of URLs, query strings and error objects. There is no `?key=` fallback. Resolves the SDK client lazily on first use, so the adapter is importable and registrable in a deployment with no Google credential configured; a missing key surfaces as `lyria.missing_api_key` on that one song. Passes `maxRetries: 0` — a retried generation is a second song paid for. Maps Google's failures onto the shared `ExternalApiError` taxonomy (`lyria.invalid_authentication`, `lyria.forbidden`, `lyria.invalid_request`, `lyria.rate_limited`, `lyria.quota_exceeded`, `lyria.server_error`, `lyria.api_error`), attaching only a status code — never the SDK error, its config or its request.
- **`PromptBuilder`** — assembles the single text prompt: the imported `MUREKA_STYLE` (imported, never copied, so the A/B comparison cannot drift), the vocal gender in prose (Lyria has no `gender` field), and the approved lyrics verbatim. `[Ending]` is left exactly as approved even though Google documents only `[Verse]`/`[Chorus]`/`[Bridge]` — rewriting an approved lyric to suit a provider is not this layer's decision.
- **`ResponseParser`** — validates the response with Zod and decodes `output_audio.data` from base64 into bytes. Requires audio; tolerates a missing interaction id rather than discarding a song that was already generated and paid for.
- **`LyriaSongService`** — implements `SongGenerationProvider` with `name: "lyria"` and `model: "lyria-3.5"` (both persisted on the Song). Deliberately has **no** `pollGenerationStatus`: there is never a task to poll.

**Request/Response Format** — `POST https://generativelanguage.googleapis.com/v1beta/interactions` (via the SDK), `{ model: "lyria-3.5", input: "<style + voice + lyrics>" }`. The response carries `output_audio` (`mime_type: "audio/mpeg"`, base64 `data`), `output_text` and an interaction `id`.

**Live validation** — Before the adapter was written, one real generation was run against the production key: the route authenticated through the SDK, returned MP3 audio (44.1 kHz stereo, 192 kb/s) in ~46 seconds, and the existing `FfmpegAudioProcessor` cut its 66.53 seconds to exactly 60.00. The measured latency is why `GET /api/internal/pipeline/run` now declares `maxDuration = 300`.

**Failure Handling** — No retries at all on the generation call (see above). A whitelisted `lyria.quota_exceeded` may hand the song to the configured fallback provider; every other failure fails the song, and post-generation failures (FFmpeg, R2, email) never trigger a fallback because the audio has already been paid for.

**Notes** — Lyria audio carries Google's SynthID watermark and C2PA Content Credentials in its ID3 metadata. The metadata does not survive FFmpeg re-encoding; handling provenance is deliberately out of scope for this integration.

## Supabase

**Responsibilities**

- PostgreSQL

**Purpose** — Primary relational database (via Prisma) for all domain records (Lead, Lyrics, Song, Campaign, Mood, GenerationAttempt).

**Note on scope** — `PROJECT_MANIFEST.md` lists Supabase Authentication as available infrastructure, but it is not exercised by the delivered V1 flow: the Admin panel uses its own signed-session-cookie authentication (see `docs/Architecture/System_Architecture.md` — Authentication Flow), not Supabase Auth. Object storage for generated audio is Cloudflare R2, not Supabase Storage — see below.

**Expected Inputs** — Reads/writes from repository implementations.

**Expected Outputs** — Persisted/retrieved domain records.

**Failure Scenarios** — Connection failure, constraint violation.

**Retry Policy** — Retry transient connection failures a limited number of times; constraint violations (e.g. duplicate email) are not retried — they are translated into the corresponding business error.

**Operational health (RC-2 — Production Hardening)** — `HealthCheckService` runs a trivial `SELECT 1` via the shared Prisma client as the database check for `GET /api/internal/health`.

## Cloudflare R2

**Responsibilities**

- Private object storage for generated audio

**Purpose** — S3-compatible object storage for the platform's generated song files. Implemented at `src/infrastructure/storage/`. The bucket is **never publicly exposed** — there is no public bucket URL or public-access configuration anywhere in this integration; every read goes through a short-lived, presigned URL generated on demand.

**Classes:**

- **`StorageClient`** — minimal wrapper around the official `@aws-sdk/client-s3` `S3Client` (plus `@aws-sdk/s3-request-presigner` for signing), configured with `R2_ENDPOINT` (never built from the account ID in code), credentials, and bucket, all from `appConfig.storage`. Exposes the raw `putObject`/`headObject`/`deleteObject`/presigned-URL SDK calls, nothing else.
- **`CloudflareR2Storage`** — orchestrates the client into the four supported operations: `upload`, `generateSignedDownloadUrl` (a presigned `GetObjectCommand` URL, expiring after `R2_SIGNED_URL_EXPIRY_SECONDS` — see `src/config/constants.ts`), `delete`, `exists`. Translates any SDK failure into the shared `ExternalApiError` — no raw AWS SDK exception ever escapes the infrastructure layer.

**Current wiring** — `GenerationPoller` downloads the provider's audio from its own (short-lived) URL and uploads it here, persisting only the resulting object key on `Song.audioStorageKey` — never a signed URL, never the provider's URL. Mureka's `ready_to_download` result triggers download → upload → `COMPLETED` → "song ready" email handling (the same handler that also still supports a synchronous `completed` result, the shape a future non-async provider could use — see `docs/Architecture/System_Architecture.md`). Every consumer that needs to show or email the audio (the "song ready" email, the parent-facing session endpoint, the admin Lead Detail view, the admin manual resend action, the legacy `/api/song/[songId]` status endpoint) resolves a fresh signed URL at read time through `AudioUrlResolver`/`R2AudioUrlResolver` — none of them ever reads or persists a URL directly. `R2_SIGNED_URL_EXPIRY_SECONDS` (`src/config/constants.ts`) is set long enough (7 days) for an emailed link to still work well after generation, not just for a URL resolved and used within the same request.

**Failure Scenarios** — Invalid credentials, bucket permission errors, network failure.

**Retry Policy** — None beyond what the AWS SDK itself performs by default; this integration does not add its own retry loop.

**Live validation (Gate 9.4)** — With Mureka generation credits unavailable, a real end-to-end generation wasn't possible; the storage half was instead validated directly against the live bucket: a scratch object was uploaded via `CloudflareR2Storage.upload`, confirmed present via `exists`, then removed via `delete` and reconfirmed absent — the exact abstraction `GenerationPoller` calls, exercised for real at no Mureka cost.

**Operational health (RC-2 — Production Hardening)** — `HealthCheckService` (`src/infrastructure/health/`) calls `exists()` on a fixed, never-written key (`_internal/health-check-probe`) as a connectivity check for `GET /api/internal/health` — safe even though the key never exists, since `exists()` returns `false` rather than throwing for a missing key; only a genuine connectivity/credentials failure is reported as unhealthy.

## Resend

**Responsibilities**

- Transactional emails

**Purpose** — Delivers the one-time "song ready" email to the lead once their Song reaches `COMPLETED`. Implemented at `src/infrastructure/email/`.

**Classes:**

- **`ResendClient`** — minimal HTTP client for Resend's email-sending endpoint, built on the shared `httpRequest` helper (`src/shared/http/`) rather than the official SDK, consistent with the Claude/Mureka integrations. Adds the bearer token (from `appConfig.resend.apiKey`) and posts the `from`/`to`/`subject`/`html` payload. `checkHealth` (RC-2 — Production Hardening) calls Resend's own read-only `GET /domains` — used only by `HealthCheckService` for `GET /api/internal/health`, never sends anything.
- **`SongReadyEmailTemplate`** — builds the fixed subject ("Your personalized song is ready!") and a responsive, table-based, inline-styled HTML body (greeting, thank-you message, campaign branding, a direct "Play the song" button, a direct "Download the song" button, support contact, footer). Both buttons link straight to the stored `audioUrl` — this integration never proxies or re-serves the file itself.
- **`ResendEmailService`** — implements the application layer's `SongEmailSender` port; orchestrates building the template and calling the client, the same "build payload → call provider" shape as `MurekaSongService`.

**Trigger & Idempotency** — Email delivery is driven from `GenerationPoller` (`src/application/song/use-cases/`), immediately after a Song is persisted `COMPLETED` — currently Mureka's `ready_to_download` result (Gate 9.5 — Complete End-to-End Song Delivery unified this with a synchronous provider's `completed` handling into a single shared handler). Exactly one email is guaranteed per Song via `PrismaEmailDeliveryTracker` (`src/infrastructure/persistence/prisma/song/`), which claims delivery through a single atomic, conditional `UPDATE songs SET "emailedAt" = now() WHERE id = $1 AND "emailedAt" IS NULL`. Only the caller that flips this row (`count === 1`) is allowed to call `ResendEmailService`; every other caller — including a background job that somehow ran twice for the same song — sees `count === 0` and must not send. A failure inside the email step (Resend unavailable, malformed lead data, etc.) is caught and logged, never rethrown: by that point the audio is already downloaded, stored in R2, and the Song already `COMPLETED`, and `Song`'s state machine has no `COMPLETED -> FAILED` transition, so an email failure must never be allowed to look like a generation failure — the existing admin resend-email flow (`ResendSongEmailUseCase`) remains the recovery path.

**Live validation (Gate 9.5)** — With Mureka generation credits still unavailable, the provider step was mocked, but `GenerationPoller` was run against the real `ResendEmailService` (and the real R2 classes) end-to-end: one real "song ready" email was sent to the developer's own address, authorized explicitly for this validation, confirming the real Resend call completes without error from within the actual production code path.

**Expected Inputs** — Recipient email, parent/baby name, the Song's `audioUrl` and `duration`.

**Expected Outputs** — Delivery confirmation/status from Resend (not otherwise surfaced to the user — the email is fire-and-forget from the user's perspective).

**Failure Scenarios** — Delivery failure, invalid recipient, service outage, an invalid response body.

**Retry Policy** — Transient network failures are retried transparently by the shared `httpRequest` helper, same as Claude/Mureka; on persistent failure the error is logged for admin follow-up rather than blocking or retrying the user-facing flow — and, per the idempotency mechanism above, the claim is not released, so a persistently-failed send is not retried automatically either (this campaign has no queue/worker to schedule such a retry — see "Why This Project Intentionally Avoids" in `docs/Architecture/System_Architecture.md`).

## Vercel

**Responsibilities**

- Hosting

**Purpose** — Hosts and deploys the single Next.js application. Vercel no longer schedules anything for this project — see "GitHub Actions" below (HOTFIX: the Vercel Hobby plan restricts Cron Jobs to once per day, which broke every deployment once RC-2's 5-minute `vercel.json` cron was introduced; `vercel.json` was removed outright rather than reduced in frequency).

**Expected Inputs** — Application build/deployment.

**Expected Outputs** — Publicly reachable, deployed application.

**Failure Scenarios** — Build failure, deployment failure, platform outage.

**Retry Policy** — Deployment failures are addressed by fixing the underlying build/config issue and redeploying; no automatic retry of a broken build.

## GitHub Actions

**Responsibilities**

- Scheduled pipeline execution — the External Scheduler (RC-2 — Production Hardening; provider changed in a later HOTFIX)

**Purpose** — `.github/workflows/song-pipeline.yml` runs on a `schedule` trigger (`*/10 * * * *`, every 10 minutes) and supports manual `workflow_dispatch`, calling `GET /api/internal/pipeline/run` — see "Asynchronous Song Generation" → "External Scheduler" in `docs/Architecture/System_Architecture.md`. The workflow explicitly sends `Authorization: Bearer ${{ secrets.CRON_SECRET }}`, reading `CRON_SECRET` from GitHub Secrets (never hardcoded) and the target application URL from the `APP_URL` repository variable; the route verifies the secret (`verifyInternalSecret`) before doing anything. A `concurrency` group (`song-pipeline`, `cancel-in-progress: false`) prevents overlapping executions.

**Expected Inputs** — The `CRON_SECRET` GitHub Secret and `APP_URL` repository variable (see `docs/Development/Environment.md`); optionally a manual `workflow_dispatch` trigger from the Actions tab.

**Expected Outputs** — A `GenerationDispatcher`/`GenerationPoller` run roughly every 10 minutes, independent of user traffic. The workflow run is marked failed if the endpoint responds with a non-2xx status (`curl --fail-with-body`), surfacing pipeline failures in GitHub's own Actions UI/notifications.

**Failure Scenarios** — A missed/delayed scheduled run (GitHub Actions schedules are best-effort, same tolerance the queue already had under Vercel Cron), a misconfigured or rotated `CRON_SECRET`/`APP_URL`, a GitHub Actions platform outage.

**Retry Policy** — A failed pipeline tick is not retried within the same run — it simply waits for the next scheduled invocation (10 minutes later), which is also when a Song stuck past `GENERATION_TIMEOUT_MINUTES` would be reclaimed. A run can also be re-triggered manually via `workflow_dispatch`.

## Google Tag Manager

**Responsibilities**

- The exclusive mechanism for all external analytics/tracking integrations (Feature 1 — GTM Configuration)

**Purpose** — Lets the campaign team manage tracking/analytics tags without further code changes, while keeping the codebase itself free of any analytics-provider SDK or hardcoded tracking id. There is no direct application-level integration with any analytics provider (GA4, Meta Pixel, etc.) — anything beyond page-load tracking is configured inside the GTM container itself, entirely outside this repository.

**Configuration, not a client SDK** — Unlike every other integration in this document, there is no dedicated client class calling an external API. The only application code involved is: `Campaign.gtmContainerId` (a nullable string column — the single global setting, see `docs/Architecture/Database_Model.md`), `CampaignSettingsGate`/`PrismaCampaignSettingsGate` (`src/application/campaign/`, `src/infrastructure/persistence/prisma/campaign/`) for reading/writing it, `GetCampaignSettingsUseCase`/`UpdateGtmSettingsUseCase` (`src/application/admin/use-cases/`) for the Admin Settings screen, and `GoogleTagManager` (`src/features/landing/components/`) — a client component that reads the current value from the public `GET /api/settings/gtm` endpoint and, only when non-empty, renders Google's own official snippet (a `next/script` tag plus a `<noscript>` iframe fallback) on the Landing.

**Persistence, not an environment variable** — `Campaign.gtmContainerId` is validated against `GTM-[A-Z0-9]+` (case-insensitive, uppercased on save) by `UpdateGtmSettingsUseCase` before being persisted; an empty/blank value clears it. This is deliberate: an environment variable would require a redeploy to change, and campaign operators need to toggle/update tracking themselves from the Admin panel.

**Expected Inputs** — An admin-entered GTM container id (`PATCH /api/admin/settings`, admin-session-gated).

**Expected Outputs** — The official GTM snippet rendered on the Landing when configured; nothing rendered when not.

**Failure Scenarios** — A malformed container id is rejected at write time with a `400`, before it is ever persisted. A failure to read the setting on the Landing (`GET /api/settings/gtm`) degrades to "no GTM code rendered" rather than surfacing an error to the visitor — analytics must never break the campaign experience.

**Retry Policy** — Not applicable; GTM's own script handles its own loading/retry behavior once injected, same as on any other site that embeds it.

## Cloudflare

**Responsibilities**

- DNS

**Purpose** — Resolves the campaign domain to the Vercel-hosted application.

**Expected Inputs** — DNS configuration for the campaign domain.

**Expected Outputs** — Correct domain resolution to the application.

**Failure Scenarios** — Misconfiguration, propagation delay, outage.

**Retry Policy** — Not applicable at the application level; DNS issues are resolved via configuration correction.
