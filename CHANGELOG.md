# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
