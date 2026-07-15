# System Architecture

## High-Level Architecture

The system is a modular monolith built on Next.js, following Clean Architecture and lightweight Domain Driven Design. All code runs as a single deployable application (Vercel), with clearly separated layers inside the codebase rather than separate services or processes.

## Application Layers

- **Domain** — Core business concepts and rules: leads, emails, attempts, moods, lyrics, songs. No framework or infrastructure dependencies.
- **Application** — Use cases / orchestration (e.g. register lead, generate lyrics, accept lyrics, generate song, deliver email). Depends only on the domain layer and repository/service interfaces.
- **Infrastructure** — Implementations of repositories and external service adapters (Prisma/Supabase persistence, Claude client, Mureka client, Resend client, Cloudflare R2 storage client).
- **Presentation** — Next.js Route Handlers and UI (React components, pages) that call into the application layer.

Dependencies point inward: presentation and infrastructure depend on application and domain; domain depends on nothing else.

## External Services

- **Anthropic Claude API** — content moderation and lyrics generation.
- **Mureka API** — final song (audio) generation; the sole active music provider (see PROJECT_MANIFEST.md).
- **Supabase** — primary database (via Prisma).
- **Cloudflare R2** — private object storage for generated audio (S3-compatible, via `@aws-sdk/client-s3`). The bucket has no public access; every download goes through a short-lived, presigned URL generated on demand, resolved fresh at read time and never persisted. Implemented at the infrastructure layer (`src/infrastructure/storage/`) — see `docs/Architecture/External_Services.md`.
- **Resend** — transactional email delivery of the final song.
- **Vercel** — hosting and deployment; also runs the pipeline scheduler (RC-2 — Production Hardening, see "Pipeline scheduler" below).
- **Cloudflare** — DNS/CDN/edge in front of the deployed application.

## Main Request Flow

1. User submits registration + personalization via a Next.js Route Handler.
2. Application layer checks email uniqueness and remaining attempts (domain rules).
3. Application layer calls Claude for moderation; on rejection, an attempt is consumed and the flow returns an error to the user.
4. On approval, application layer calls Claude to generate lyrics and returns a preview to the user.
5. User accepts or requests regeneration (consuming an attempt) via another Route Handler call.
6. On acceptance, the `Song` job is queued synchronously (no attempt consumed) and `GenerationDispatcher`/`GenerationPoller` are scheduled in the background (see "Asynchronous Song Generation" below) — `GenerationDispatcher` submits the job to Mureka, and a later run of `GenerationPoller` (triggered by the next request, or the pipeline scheduler) downloads the finished audio once Mureka reports it ready.
7. `GenerationPoller` uploads the downloaded audio to Cloudflare R2 and persists only the resulting object key (`Song.audioStorageKey`) — never a provider URL, never a signed URL.
8. Once the `Song` is `COMPLETED`, `GenerationPoller` triggers Resend to email the final song, resolving a fresh signed R2 URL at send time.
9. Lead/campaign state is persisted throughout via the Repository Pattern over Prisma/Supabase.

## Data Flow

Lead and personalization data, attempt counts, moderation results, lyrics versions, and final song references are persisted in the database via repositories. Audio itself is stored in Cloudflare R2; only the resulting object key (`Song.audioStorageKey`) is persisted on the `Song` record — never a provider URL or a signed URL — see `docs/Architecture/External_Services.md`. The admin panel reads this same persisted data to display submissions and produce CSV exports.

## Deployment Architecture

The Next.js application is deployed as a single unit to Vercel, sitting behind Cloudflare. Supabase hosts the database. There is no separate backend service, queue, or worker fleet — all orchestration (moderation → lyrics → song → email) happens within the same application via Route Handlers and application-layer use cases.

## Technology Decisions

See `PROJECT_MANIFEST.md` for the full stack. Key decisions:

- **Next.js Route Handlers** instead of a separate API service — keeps the monolith cohesive and avoids operating a second deployable.
- **Prisma + Supabase** for a single, managed relational data store — no need for polyglot persistence at this scale.
- **Repository Pattern + Dependency Injection** to keep domain/application code decoupled from Prisma/Supabase specifics, without introducing a heavier framework. Dependency Injection here means plain constructor injection at each composition root (e.g. `app/api/leads/route.ts` constructs `new CreateLeadUseCase(new PrismaLeadRepository(), campaignConfig)`) — every use case depends only on a repository/service _interface_, never a concrete class, which is what makes each one independently testable with a fake. There is deliberately no DI container/framework: at this scale, one wired at the top of each route is simpler and equally swappable.

## Lead Persistence Flow

The first concrete Repository Pattern implementation lives at `src/infrastructure/persistence/prisma/lead/`:

- **`PrismaLeadRepository`** implements the domain's `LeadRepository` interface (`src/domain/lead/repositories/LeadRepository.ts`) — the application layer depends only on that interface and is unaware a Prisma implementation exists.
- **`LeadMapper`** translates between the Prisma `Lead` model and the `Lead` domain entity in both directions. No Prisma type is ever returned from the repository — every method returns a domain `Lead` (or `null`/`boolean`). Because the persistence-layer `LeadStatus` enum is more granular than the domain's (it also encodes lyrics/song sub-states that don't have their own aggregates yet), the mapper collapses every "in progress" persistence value to the domain's single `GENERATING` status on read, and rejects writing the domain's `FAILED` status outright rather than silently mis-storing it as a different persistence value — see the mapper's source comments and `docs/Architecture/Domain_Model.md`.
- **`src/infrastructure/persistence/prisma/client.ts`** holds a single, `globalThis`-cached `PrismaClient`, constructed with the `@prisma/adapter-pg` driver adapter (required by the generated client in this Prisma version) using `appConfig.database.url` — never a direct `process.env` read.
- Prisma exceptions (`PrismaClientKnownRequestError`, etc.) are caught inside the repository and re-thrown as the shared error types from `src/shared/errors` (a unique-constraint violation on email becomes a `BusinessRuleError`; everything else becomes a `DatabaseError`). No Prisma-specific exception crosses the repository boundary.

## Lead Registration Request Flow

`POST /api/leads` (`app/api/leads/route.ts`) is the first public API and the thinnest possible Presentation-layer wrapper around the layers below it:

1. Parse the request body as JSON; malformed JSON short-circuits to `400` before anything else runs.
2. Validate its shape with a Zod schema — presence, type, and basic non-emptiness only. This schema deliberately does **not** duplicate semantic validation (e.g. email format) that already lives in the domain's value objects; a failure here also returns `400`.
3. Construct `CreateLeadUseCase` (from `src/application/lead/`) with a `PrismaLeadRepository` and a small inline adapter satisfying `LeadCampaignConfig` (backed by `appConfig.campaign.maxLyricAttempts`) and call `execute()`.
4. Map the result to the public response shape (`leadId`, `remainingAttempts`, `status` only — no campaign ID, timestamps, or other persistence detail).
5. Map any thrown error to an HTTP status by category: a domain `ValidationError` → `400`; a `BusinessRuleError` with code `lead.email_already_registered` → `409`; any other `BusinessRuleError` → `422`; anything else → `500`, logged server-side via `src/shared/logger`, with only a generic message returned to the client — never a stack trace or a raw Prisma/database error.

No business rule is evaluated inside the route handler itself; it only translates between HTTP and the Application layer's existing `CreateLeadRequest`/`CreateLeadResponse` DTOs.

## Lyrics Generation Request Sequence

`POST /api/lyrics/generate` (`app/api/lyrics/generate/route.ts`) is another thin Presentation-layer wrapper, this time around a new orchestration use case, `GenerateLyricsForLeadUseCase` (`src/application/lyrics/use-cases/`), added specifically because the existing `GenerateLyricsUseCase` was deliberately scoped to "lyrics version bookkeeping only" (see `docs/Architecture/Domain_Model.md`) and cannot, by itself, validate a lead, consume attempts, or call Claude.

1. The route parses and Zod-validates the request body (`leadId`, `moodId`, `moodName`, `moodDescription`, `parentMessage`) — shape only, same convention as `/api/leads`.
2. `GenerateLyricsForLeadUseCase.execute`:
   - Loads the `Lead` via `LeadRepository.findById`; not found → `BusinessRuleError` (`404`).
   - Checks `remainingAttempts > 0`; none left → `BusinessRuleError` (`422`).
   - Checks `LyricsRepository.findAllByLead` to determine whether this is the lead's first generation or a regeneration — this, not a client-supplied flag, is what the attempt-consumption rule keys on (see `docs/Product/Business_Rules.md`).
   - Transitions the lead `REGISTERED → GENERATING` on the very first call only.
   - Makes the **single** Claude request via the `LyricsGenerator` port (`src/application/lyrics/contracts/`), satisfied by `ClaudeLyricsService` (`src/infrastructure/ai/claude/`) — the application layer depends only on the port, never on the concrete Claude classes.
   - Consumes one attempt if this was a regeneration, or if the result was rejected (never both, never for a first-time approval) and persists the lead via `LeadRepository.update`.
   - On approval, delegates to the existing `GenerateLyricsUseCase` to persist the new version (reused unmodified); on rejection, no Lyrics record is created — there is no generated content to store.
3. The route maps the response 1:1 to JSON, and maps thrown errors to HTTP status by category — notably, `ExternalApiError` (a Claude failure) maps to `503`, distinct from the generic `500` bucket, since "the AI provider is down" is a meaningfully different, and separately documented (see `docs/Architecture/External_Services.md`), failure mode from "something unexpected broke."

`POST /api/lyrics/approve` (`app/api/lyrics/approve/route.ts`) needed no new use case — the existing `ApproveLyricsUseCase` already fully covers "approve this version, reject if the lead already has a different one approved," so the route is a direct, unmodified wrapper around it, backed by a new `PrismaLyricsRepository`/`LyricsMapper` (`src/infrastructure/persistence/prisma/lyrics/`) mirroring the Lead module's persistence pattern exactly.

## Asynchronous Song Generation

Song generation is the one step of the pipeline that runs in the background rather than synchronously within the request, because a music-provider generation call takes far longer than a client should be made to wait on an HTTP response. There is still no queue or worker fleet (see "Why This Project Intentionally Avoids" below) — "background" means an in-process callback scheduled via Next.js's `after()`, not a separate deployable.

**State machine.** `Song.status` moves through `QUEUED → GENERATING → COMPLETED | FAILED`, with one additional transition, `FAILED → QUEUED`, allowed specifically to support manual retry (`Song.leadId` is a unique DB constraint, so a failed attempt must not permanently occupy a lead's one-song slot). The public API vocabulary matches these names directly (see `app/api/song/publicSongStatus.ts`).

**Three use cases, one workflow (Sprint 7.5 / Sprint 9.1).** The pipeline is intake → submit → poll-to-completion, each its own use case with a clean seam between them:

- **`GenerateSongUseCase`** (`src/application/song/use-cases/`) — the synchronous intake. It runs every rule that requires a repository lookup (lead exists, no existing `COMPLETED` song, campaign active, exactly one approved lyrics version), persists the `Song` as `QUEUED` (or reuses the existing row on a retry after `FAILED`), and returns immediately. It never calls the music provider.
- **`GenerationDispatcher`** (`src/application/song/use-cases/`) — takes the oldest `QUEUED` song, transitions it to `GENERATING`, and submits it to the injected `SongGenerationProvider`, persisting `providerTaskId`/`providerTraceId`/`submittedAt`. It never waits for the provider to finish, never downloads audio, and never sends an email — submission and completion are two separate concerns. This is also where the provider's one-concurrent-generation limit is enforced: if a `Song` is already `GENERATING`, a dispatch run is a no-op — unless it has been `GENERATING` past `GENERATION_TIMEOUT_MINUTES` (RC-2 — Production Hardening, default 30), in which case it's reclaimed at the start of the same run (marked `FAILED` with a descriptive `providerError`, freeing the slot), and dispatch continues immediately with the oldest `QUEUED` song, if any, in that same call. No manual database intervention is ever required to unstick the queue.
- **`GenerationPoller`** (`src/application/song/use-cases/`) — finds the `Song` currently `GENERATING` and asks the provider whether it has finished. Still in progress → no-op this run (persisting the provider's raw status via `Song.recordProviderStatus`, diagnostics only). Finished with an error → `FAILED`, with the provider's reported error persisted. Finished successfully — Mureka's `ready_to_download` result (the port also still supports a `completed` result from a hypothetical synchronous provider, going through the exact same shared handler — see `SongGenerationProvider`) — downloads the audio from the provider's own (short-lived) URL, uploads it to Cloudflare R2, persists only the resulting object key (`Song.audioStorageKey` — never a signed URL, never the provider's URL, see "Cloudflare R2" in `docs/Architecture/External_Services.md`), marks the song `COMPLETED`, and only once all of that has already succeeded, delivers the "song ready" email (Gate 9.5 — Complete End-to-End Song Delivery). Retries purely at the infrastructure layer (`httpRequest`'s timeout/retry beneath the downloader, the AWS SDK's built-in retry beneath R2 uploads); `GenerationPoller` itself never retries, and never marks `COMPLETED` unless the R2 upload already succeeded. An email failure is caught inside the existing email-delivery step and never rolls back an already-persisted `COMPLETED` Song — the admin resend-email flow remains the recovery path.

Splitting submission from polling (rather than one call that blocks through the whole lifecycle) is what lets the pipeline work with a genuinely asynchronous, task-based provider in the future without changing `GenerateSongUseCase`, the `Song` state machine, or the email/idempotency machinery — only a new `SongGenerationProvider` implementation.

**Request sequence.** Two routes create the same `QUEUED → GENERATING → COMPLETED|FAILED` pipeline: `POST /api/lyrics/approve` (the primary flow — creates the `Song` job synchronously right after lyrics approval) and `POST /api/song/generate` (kept for `GenerateSongUseCase`'s own idempotency, not called by the current frontend). Both:

1. Call the relevant synchronous use case and await it — fast, no external call, and what the client actually waits on.
2. Schedule `GenerationDispatcher.execute()` then `GenerationPoller.execute()`, in that order, inside one `after()` callback, wrapped in its own `try/catch` — a rejection here is logged and never crashes the request, because every failure path inside either use case already persists `FAILED` itself before rethrowing.
3. Respond immediately. The schedule and the response are not ordered by a wait — `after()` guarantees the callback keeps running after the response is sent, not that it runs before it.

**Pipeline scheduler (RC-2 — Production Hardening).** Every trigger above only fires from inside a user-facing request — before this gate, if no such request happened to arrive while the queue had work to do (or the triggering request's `after()` callback never got to finish, e.g. a serverless function timeout), nothing else advanced the queue. `GET /api/internal/pipeline/run` closes that gap: a Vercel Cron job (`vercel.json`, currently every 5 minutes) calls it directly, running `GenerationDispatcher.execute()` then `GenerationPoller.execute()` exactly once — the same sequence, but independent of whether any user traffic is happening at all, and awaited synchronously rather than backgrounded via `after()` (there is no user response to protect here, so a genuine failure is surfaced as a non-2xx status for cron-execution monitoring, instead of always answering 200). It is never reachable without the shared `CRON_SECRET` (`verifyInternalSecret`, timing-safe comparison) — there is no public execution path. The same secret also protects `GET /api/internal/health` (RC-2), which reports database/R2/Resend/Mureka status for external uptime monitoring (see `HealthCheckService`).

There is no more client-side polling anywhere in this flow (Sprint 7.5 removed it): the parent-facing Song Result page does a single `GET /api/leads/session` fetch on mount and is otherwise notified only by email once the song is `COMPLETED`. `GET /api/song/[songId]` (`app/api/song/[songId]/route.ts`) still exists as a public, session-scoped status read, but nothing in the current frontend calls it.

**Error handling.** A provider timeout, an unavailable provider, or an unexpected/malformed provider response are all just exceptions from the `SongGenerationProvider` port as far as `GenerationDispatcher`/`GenerationPoller` are concerned — every one of them is caught, persisted as `FAILED` (with the error message on `Song.providerError`), and rethrown (so the background-scheduling `catch` in the route can log it). None of them are retried automatically; a `FAILED` song is simply left available for a manual admin retry (`POST /api/admin/songs/[songId]/retry`), which reuses the same row instead of creating a duplicate.

## Administration Module

The Administration module (`src/domain/admin/`, `src/application/admin/`, `src/infrastructure/auth/` + `src/infrastructure/persistence/prisma/admin/`, `app/admin/`, `app/api/admin/`) is a separate, read-only operational surface for campaign operators, layered exactly like every other module — it introduces no new architectural pattern, only new modules within the existing one.

**Domain.** `AdminUser` models only the login lifecycle (`assertCanAuthenticate`, `recordLogin`) — there is no create/edit flow, since accounts are provisioned directly in the database (see Authentication Flow below). `AuditLogEntry` is an immutable record of an administrative action (`login`, `view_lead`), backed by the pre-existing `AuditLog` Prisma model.

**Reused, not duplicated.** The Dashboard, Search, and Lead Detail screens are pure reads over the existing `Lead`, `Lyrics`, and `Song` repositories — `GetLeadDetailUseCase` composes `LeadRepository.findById`, `LyricsRepository.findAllByLead`/`findApprovedByLead`, and `SongRepository.findByLead` directly, with no parallel read model for lead/lyrics/song data. The one addition to an existing aggregate: `Song` gained a read-only `emailedAt` getter (populated from the already-existing `emailedAt` column) so the Lead Detail screen can show email delivery status — previously that column was written by `PrismaEmailDeliveryTracker` but never read back through the domain.

**Narrow ports for cross-aggregate reads.** Two admin-specific needs have no natural home on an existing repository, so — the same pattern as `CampaignGate`/`MoodSunoPromptProvider` — they're narrow ports satisfied by thin Prisma adapters instead of new repositories: `AdminDashboardGate` (a handful of `count()` queries) and `AdminLeadSearchGate` (a paginated, sorted, `ILIKE`-searched join across `Lead` and `Song` that no other module needs).

**Execution history is a merge, not a new log.** `GetLeadDetailUseCase.buildExecutionHistory` produces one unified, newest-first timeline (`ExecutionHistoryItem[]`) by combining two different kinds of source data: system events synthesized purely from timestamps already present on the Lead/Lyrics/Song snapshots it already has in hand (`actor: null` — nothing new is written for these), and the real `AuditLogEntry` rows for admin-initiated actions (`view_lead`, `retry_song`, `resend_email`), fetched via the existing `AuditLogRepository.findByEntity`, called once for `("Lead", leadId)` and once for `("Song", songId)` when a song exists. No new persistence, and no change to `AuditLogRepository`'s interface, was needed — it was already generic over `entity`/`entityId`.

## Operational Recovery Workflow

Two admin-only mutations exist specifically to recover a stuck campaign execution — see docs/Product/User_Flow.md — Operational Recovery for the user-facing behavior. Both are implemented in `src/application/admin/use-cases/` and reuse the Song module's existing machinery as-is; neither introduces a new generation or delivery mechanism.

**Retry (`RetryFailedSongUseCase` + `POST /api/admin/songs/[songId]/retry`).** `Song` gained one additional state transition for this alone: `FAILED -> PENDING` (`Song.retryFromFailure()`, alongside the pre-existing `FAILED -> GENERATING` used by a parent-initiated retry). The use case only validates the song is `FAILED`, calls `retryFromFailure()`, and persists it — no lyrics lookup, no Lead access, no new `Song` row. The route then schedules `ProcessSongGenerationUseCase` for the same `songId` via `after()`, exactly the same "respond now, generate in the background" sequence as `POST /api/song/generate` (see "Asynchronous Song Generation" above). Because `ProcessSongGenerationUseCase` is reused completely unmodified, "never regenerate lyrics" and "never consume another attempt" are automatic consequences of its existing implementation, not something the retry path has to separately guarantee: it only ever reads lyrics (`LyricsRepository.findById`) and never touches `Lead.remainingAttempts` at all. If the retried generation succeeds, the existing one-time email claim (`EmailDeliveryTracker.claimDelivery`) fires normally — a `FAILED` song's `emailedAt` was always still `null`, since that step only ever runs after a successful `markReady()`.

**Resend (`ResendSongEmailUseCase` + `POST /api/admin/songs/[songId]/resend-email`).** Requires the song to be `READY` (`COMPLETED`) _and_ already have a non-null `emailedAt` (i.e. the automatic email already went out). It calls `SongEmailSender.sendSongReadyEmail` directly — the same port `ProcessSongGenerationUseCase` uses for the automatic send — but deliberately has no `EmailDeliveryTracker` dependency at all, so it is structurally impossible for a manual resend to interact with the automatic delivery's atomic claim; each confirmed resend is simply one more `sendSongReadyEmail` call, audited with the reason. This is why an admin can resend more than once over time (each one independently reasoned and recorded), while the _automatic_ delivery still only ever fires exactly once per song.

**Audit.** Both actions write an `AuditLogEntry` (`entity: "Song"`, `entityId: songId`) before returning — `retry_song` with just the acting admin id, `resend_email` with the reason in `metadata`. These are exactly the rows `GetLeadDetailUseCase` folds into the execution history described above.

## Operational Reporting Flow

The Dashboard's summary indicators, the participants table's filters, and the CSV export (see docs/Product/User_Flow.md — Operational Reports) are all read-only reporting — no BI dashboards, charts, or campaign-configuration controls (see PROJECT_MANIFEST.md). All three build on the same two narrow ports introduced for the Dashboard/Search screens (`AdminDashboardGate`, `AdminLeadSearchGate`), plus one new one for export.

**Dashboard metrics.** `PrismaAdminDashboardGate.getSummary()` is eight independent `count()` calls across `Lead`, `Lyrics`, `Song`, and `AuditLog` (`lyricsGenerated`/`lyricsApproved` off `Lyrics`; `songsRequested`/`songsCompleted`/`songsFailed`/`emailsSent` off `Song`; `emailsResent` off `AuditLog` where `action: "resend_email"`) — no joins, no aggregation logic beyond `WHERE`. `GetDashboardSummaryUseCase` computes the one derived figure, `generationSuccessRate` (`songsCompleted / songsRequested`, rounded to a whole-number percentage, `0` when `songsRequested` is `0`), in the application layer rather than in SQL, since it's arithmetic over two of the gate's own counts, not a query.

**Shared filter criteria.** `AdminLeadFilterCriteria` (`src/application/admin/contracts/`) — `query`, `dateFrom`/`dateTo`, `songStatus` (the public vocabulary plus `NONE` for "no song yet"), `emailStatus` (`SENT`/`NOT_SENT`), `city` — is the one shape both `AdminLeadSearchGate.search` (paginated, for the on-screen table) and the new `AdminLeadExportGate.streamRows` (unpaginated but batched, for the CSV) accept, so search and export can never disagree about what a given filter combination matches. Both Prisma adapters build their `WHERE` clause via the same shared function, `buildAdminLeadWhere` (`src/infrastructure/persistence/prisma/admin/adminLeadFilters.ts`), which `AND`-combines whichever clauses are present (free-text `OR` across parent/baby/email/phone, an inclusive `createdAt` range, a case-insensitive `city` contains, a `song.status IN (...)` — or `song: null` for `NONE` — for song status, and `song.emailedAt` not-null/null-or-absent for email status). `SearchLeadsUseCase` and the new `ExportLeadsUseCase` both validate the date range through one shared helper, `validateDateRange`, so the two use cases can't drift on what counts as a valid range either.

**CSV export (`ExportLeadsUseCase` + `GET /api/admin/leads/export`).** `PrismaAdminLeadExportGate.streamRows` is an async generator: a plain `skip`/`take` loop over `Lead.findMany`, ordered by `(createdAt, id)` for a stable cursor, yielding one bounded batch (`EXPORT_BATCH_SIZE = 500` rows) at a time and stopping the moment a batch comes back smaller than the batch size — the full result set is never materialized in one call. The route wraps this generator in a `ReadableStream`, writing the CSV header immediately and then one line per row as each batch arrives, so the response body is produced incrementally rather than built up as a string first; the `Content-Disposition: attachment` header on the `Response` makes the browser download it natively; no client-side blob/JS handling is needed. Because a streamed response's HTTP status can't change once the first byte has gone out, every validation that can legitimately fail — bad filter values, an invalid date range — happens before the `ReadableStream` is even constructed, so those still return a proper `400`; only a genuine mid-export database error is limited to being logged server-side and ending the stream early, since there is no way to surface a failed status code at that point.

## Authentication Flow

**Password storage.** `AdminUser.passwordHash` (added via a dedicated migration, `prisma/migrations/20260714004326_add_admin_password_hash/`) is hashed with Node's built-in `scrypt` (`ScryptPasswordHasher`, `src/infrastructure/auth/`) — a random 16-byte salt per password, `<saltHex>:<derivedKeyHex>` stored format, and a `timingSafeEqual` comparison on verify. No external hashing library (bcrypt/argon2) is used, consistent with this project's preference for small, self-owned infrastructure over new dependencies (see `MurekaClient`/`ClaudeClient`, which use the shared `httpRequest` helper instead of vendor SDKs).

**Session tokens.** `SignedSessionTokenService` (`src/infrastructure/auth/`) issues a stateless, tamper-proof token: a base64url JSON payload (`{ adminId, email, exp }`) plus an HMAC-SHA256 signature over it, keyed by `appConfig.admin.sessionSecret` (a required, 32+ character env var, `ADMIN_SESSION_SECRET`). It is built on Web Crypto (`crypto.subtle`) rather than Node's `crypto` module specifically so the exact same code runs unmodified in both the login Route Handler (Node.js runtime) and `middleware.ts` (Edge runtime, by default) — there is no session store to keep in sync between the two.

**Cookie.** The token is set as `admin_session`, `HttpOnly`, `Secure`, `SameSite=Lax` (`adminSessionCookieOptions`, `src/infrastructure/auth/sessionCookie.ts`) — 8 hours by default, 14 days with "Remember me". It is never returned in a JSON response body; only the admin's public snapshot (id/email/name/role/active/lastLogin — never `passwordHash`) is.

**Request sequence — `POST /api/admin/login`:**

1. Zod-validates the request body (`email`, `password`, optional `rememberMe`) — shape only.
2. **(RC-2 — Production Hardening)** Checks the IP-based rate limit (`MAX_ADMIN_LOGIN_ATTEMPTS_PER_WINDOW`, default 10 per `RATE_LIMIT_WINDOW_MINUTES`) via the same `RateLimiter` every public endpoint already uses (Sprint 8.2). Exceeding it records a `rate_limit_exceeded` security event and responds `429`, before `LoginUseCase` is ever called.
3. `LoginUseCase` (`src/application/admin/use-cases/`) looks up the account by (trimmed, lowercased) email, verifies the password via the `PasswordHasher` port, and checks `assertCanAuthenticate()`. Whether the email doesn't exist or the password is wrong, the caller sees the identical `admin.invalid_credentials` error — the route maps both to the same generic `401 "Invalid email or password."`, never revealing which one failed. **(RC-2)** This specific error additionally records an `invalid_login_credentials` security event (`SecurityEventRecorder`, `adminId: null`) — a normal `AuditLog` entry, the same mechanism as every other suspicious-behavior recording. An `admin.account_inactive` result does not record one — that's a known account state, not suspicious behavior.
4. On success, it records `lastLogin`, issues the session token via the `SessionTokenService` port, and writes a `login` audit log entry.
5. The route sets the returned token as the `admin_session` cookie and responds with the admin's snapshot only.

**Route protection — `middleware.ts`:** gates every `/admin/:path*` and `/api/admin/:path*` request except `/admin/login`, `/api/admin/login`, and `/api/admin/logout`. It reads the `admin_session` cookie and verifies it with `SignedSessionTokenService` directly (no database round-trip); a missing, tampered, or expired token redirects page requests to `/admin/login` and returns `401 { error: "unauthorized" }` for API requests. `getAdminSession` (`src/infrastructure/auth/`) is a second, independent read of the same cookie used only by the one route that needs to know the _acting_ admin's identity (`GET /api/admin/leads/[leadId]`, to attribute its `view_lead` audit entry) — defense in depth, not the access-control gate itself.

**Provisioning.** There is no account-creation endpoint or UI — user management is explicitly out of scope for this module (see PROJECT_MANIFEST.md). An operator account is inserted directly against the `admin_users` table, with a `passwordHash` produced by `ScryptPasswordHasher.hash(...)` (or the equivalent Node `crypto.scrypt` call) ahead of time.

## Why This Project Intentionally Avoids

- **Microservices** — the campaign has a fixed, modest scale (≤3,000 songs, one month). Splitting into services would add deployment, networking, and operational overhead with no corresponding benefit.
- **Event-driven architecture** — the business flow is a linear, synchronous-enough pipeline (moderate → generate lyrics → accept → generate song → email). Introducing queues/event buses would add infrastructure and failure modes disproportionate to the task; where a step (Mureka generation) is slow enough to need to run in the background, an in-process `after()` callback plus a scheduled pipeline tick (see "Asynchronous Song Generation" above) is enough, without standing up a queue or worker fleet.
- **Multiple AI providers** — Claude and Mureka are each used for a single, well-defined responsibility (moderation/lyrics, and song generation, respectively). Supporting alternate providers would add abstraction and testing surface for a temporary campaign that will not be maintained long-term.
- **Unnecessary abstractions** — the codebase favors direct, evolvable implementations over speculative interfaces or plugin systems, since the system has one deployment target, one campaign, and a known, bounded lifetime.
