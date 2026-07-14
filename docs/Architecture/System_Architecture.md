# System Architecture

## High-Level Architecture

The system is a modular monolith built on Next.js, following Clean Architecture and lightweight Domain Driven Design. All code runs as a single deployable application (Vercel), with clearly separated layers inside the codebase rather than separate services or processes.

## Application Layers

- **Domain** — Core business concepts and rules: leads, emails, attempts, moods, lyrics, songs. No framework or infrastructure dependencies.
- **Application** — Use cases / orchestration (e.g. register lead, generate lyrics, accept lyrics, generate song, deliver email). Depends only on the domain layer and repository/service interfaces.
- **Infrastructure** — Implementations of repositories and external service adapters (Prisma/Supabase persistence, Claude client, Suno client, Resend client, Supabase Storage client).
- **Presentation** — Next.js Route Handlers and UI (React components, pages) that call into the application layer.

Dependencies point inward: presentation and infrastructure depend on application and domain; domain depends on nothing else.

## External Services

- **Anthropic Claude API** — content moderation and lyrics generation.
- **Suno API** — final song (audio) generation.
- **Supabase** — primary database (via Prisma) and Supabase Storage for audio files.
- **Resend** — transactional email delivery of the final song.
- **Vercel** — hosting and deployment.
- **Cloudflare** — DNS/CDN/edge in front of the deployed application.

## Main Request Flow

1. User submits registration + personalization via a Next.js Route Handler.
2. Application layer checks email uniqueness and remaining attempts (domain rules).
3. Application layer calls Claude for moderation; on rejection, an attempt is consumed and the flow returns an error to the user.
4. On approval, application layer calls Claude to generate lyrics and returns a preview to the user.
5. User accepts or requests regeneration (consuming an attempt) via another Route Handler call.
6. On acceptance, application layer calls Suno to generate the song (no attempt consumed).
7. Generated audio is stored in Supabase Storage.
8. Application layer triggers Resend to email the final song to the user.
9. Lead/campaign state is persisted throughout via the Repository Pattern over Prisma/Supabase.

## Data Flow

Lead and personalization data, attempt counts, moderation results, lyrics versions, and final song references are persisted in the database via repositories. Audio binaries are stored in Supabase Storage, referenced by URL/key from the database record. The admin panel reads this same persisted data to display submissions and produce CSV exports.

## Deployment Architecture

The Next.js application is deployed as a single unit to Vercel, sitting behind Cloudflare. Supabase hosts the database and object storage. There is no separate backend service, queue, or worker fleet — all orchestration (moderation → lyrics → song → email) happens within the same application via Route Handlers and application-layer use cases.

## Technology Decisions

See `PROJECT_MANIFEST.md` for the full stack. Key decisions:

- **Next.js Route Handlers** instead of a separate API service — keeps the monolith cohesive and avoids operating a second deployable.
- **Prisma + Supabase** for a single, managed relational data store — no need for polyglot persistence at this scale.
- **Repository Pattern + Dependency Injection** to keep domain/application code decoupled from Prisma/Supabase specifics, without introducing a heavier framework.

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

Song generation is the one step of the pipeline that runs in the background rather than synchronously within the request, because a Suno generation call takes far longer than a client should be made to wait on an HTTP response. There is still no queue or worker fleet (see "Why This Project Intentionally Avoids" below) — "background" means an in-process callback scheduled via Next.js's `after()`, not a separate deployable.

**State machine.** `Song.status` moves through `PENDING → GENERATING → READY | FAILED`, with one additional transition, `FAILED → GENERATING`, allowed specifically to support manual retry (`Song.leadId` is a unique DB constraint, so a failed attempt must not permanently occupy a lead's one-song slot). The public API translates the domain's internal `READY` to `COMPLETED`; `PENDING`, `GENERATING`, and `FAILED` pass through unchanged (see `app/api/song/publicSongStatus.ts`).

**Two use cases, one workflow.** The single synchronous use case from the previous version was split in two:

- **`GenerateSongUseCase`** (`src/application/song/use-cases/`) — the synchronous intake. It runs every rule that requires a repository lookup (lead exists, no existing `READY` song, campaign active, exactly one approved lyrics version), persists the `Song` as `PENDING` (or reuses the existing row on a retry after `FAILED`), and returns immediately. It never calls Suno.
- **`ProcessSongGenerationUseCase`** (`src/application/song/use-cases/`) — the background half. Given just a `songId`, it re-fetches the lyrics and mood itself, transitions the song to `GENERATING`, makes the single Suno request, and persists the outcome as `READY` (with the audio URL) or `FAILED`. It is self-sufficient given only the `songId` so it works the same way regardless of how "background" execution is wired today vs. in the future.

**Request sequence.** `POST /api/song/generate` (`app/api/song/generate/route.ts`):

1. Parses and Zod-validates the request body (`leadId` only) — shape only, same convention as every other route.
2. Calls `GenerateSongUseCase.execute` and awaits it — this is fast (no external call) and is what the client actually waits on.
3. Schedules `ProcessSongGenerationUseCase.execute({ songId })` via `after()`, wrapped in its own `try/catch` — a rejection here is logged and never crashes the request, because every failure path inside `ProcessSongGenerationUseCase` already persists `FAILED` itself before rethrowing.
4. Responds immediately with `202 Accepted` and `{ songId, status: "PENDING", estimatedNextAction }`. Steps 3 and 4 are not ordered by a wait — `after()` guarantees the callback keeps running after the response is sent, not that it runs before it.

`GET /api/song/[songId]` (`app/api/song/[songId]/route.ts`) is the polling endpoint: a thin read of the current `Song` row, translated to the public status vocabulary, with `audioUrl` included only once `status` is `COMPLETED`. The frontend polls this every 5 seconds (see `docs/Product/User_Flow.md`); there is deliberately no WebSocket or Server-Sent Events channel.

**Error handling.** A provider timeout, an unavailable provider, or an unexpected/malformed Suno response are all just exceptions from the `SunoGenerator` port as far as `ProcessSongGenerationUseCase` is concerned — every one of them is caught, persisted as `FAILED`, and rethrown (so the background-scheduling `catch` in the route can log it). None of them are retried automatically; a `FAILED` song is simply left available for a future manual call to `POST /api/song/generate`, which reuses the same row instead of creating a duplicate.

## Why This Project Intentionally Avoids

- **Microservices** — the campaign has a fixed, modest scale (≤3,000 songs, one month). Splitting into services would add deployment, networking, and operational overhead with no corresponding benefit.
- **Event-driven architecture** — the business flow is a linear, synchronous-enough pipeline (moderate → generate lyrics → accept → generate song → email). Introducing queues/event buses would add infrastructure and failure modes disproportionate to the task; where a step (Suno generation) is slow enough to need to run in the background, an in-process `after()` callback plus client polling (see "Asynchronous Song Generation" above) is enough, without standing up a queue or worker fleet.
- **Multiple AI providers** — Claude and Suno are each used for a single, well-defined responsibility (moderation/lyrics, and song generation, respectively). Supporting alternate providers would add abstraction and testing surface for a temporary campaign that will not be maintained long-term.
- **Unnecessary abstractions** — the codebase favors direct, evolvable implementations over speculative interfaces or plugin systems, since the system has one deployment target, one campaign, and a known, bounded lifetime.
