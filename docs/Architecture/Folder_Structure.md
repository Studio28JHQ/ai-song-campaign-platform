# Folder Structure

This document describes the repository organization as delivered.

## `app/`

Next.js App Router entry point: pages, layouts, and Route Handlers (API endpoints). Contains only routing and thin request/response wiring; delegates business logic to `src/application`.

- `app/page.tsx`, `app/generate/page.tsx`, `app/song/page.tsx` — the public parent-facing flow (Landing, Lyrics Review, Song Result).
- `app/admin/` — the Administration module's pages (`login`, `dashboard`, `leads/[leadId]`).
- `app/api/` — Route Handlers: `leads/`, `lyrics/{generate,approve}/`, `song/{generate,[songId]}/`, `admin/{login,logout,dashboard,leads,leads/export,leads/[leadId],songs/[songId]/{retry,resend-email}}/`.
- `app/layout.tsx`, `app/not-found.tsx`, `app/error.tsx` — root layout and branded error/not-found pages.
- `app/robots.ts`, `app/sitemap.ts` — file-based SEO conventions.
- `middleware.ts` (repository root, not under `app/`) — gates every `/admin` and `/api/admin` request; see `docs/Architecture/System_Architecture.md` — Authentication Flow.

## `src/`

Root of the application source code, organized by layer following Clean Architecture. Four modules exist side by side, each cutting through every layer: `lead/`, `lyrics/`, `song/`, `admin/`.

### `src/domain/`

Core business entities, value objects, and domain rules — one subfolder per module (`lead/`, `lyrics/`, `song/`, `admin/`), each with `entities/`, `repositories/` (interfaces only), and `types/` (plus `value-objects/` for `lead/`). No framework or infrastructure imports — verified by this project's dependency-direction audit (see `docs/Development/Definition_of_Done.md`).

### `src/application/`

Use cases, DTOs, and narrow ports (`contracts/`) that orchestrate domain logic per module — e.g. `CreateLeadUseCase`, `GenerateLyricsForLeadUseCase`, `GenerateSongUseCase`/`ProcessSongGenerationUseCase`, the Admin module's reporting and recovery use cases. Depends on domain and on repository/service interfaces, never on concrete infrastructure or Next.js.

### `src/infrastructure/`

Concrete implementations of the interfaces defined in `application`/`domain`:

- `persistence/prisma/{lead,lyrics,song,admin,security}/` — Prisma-backed repositories and mappers, plus the shared Prisma client (`persistence/prisma/client.ts`).
- `ai/claude/` — `ClaudeClient`, `PromptBuilder`, `ResponseParser`, `ClaudeLyricsService`.
- `mureka/` — `MurekaClient`, `PromptBuilder`, `ResponseParser`, `MurekaSongService` — the active `SongGenerationProvider`.
- `storage/` — `StorageClient`, `CloudflareR2Storage`, `R2AudioUrlResolver`, `HttpAudioDownloader`.
- `email/` — `ResendClient`, `SongReadyEmailTemplate`, `ResendEmailService`.
- `auth/` — `ScryptPasswordHasher`, `SignedSessionTokenService`, `sessionCookie.ts`, `getAdminSession.ts`.
- `security/` — `TurnstileClient`, `TurnstileVerifier` (Sprint 8.2 — Abuse Protection).
- `health/` — `HealthCheckService` (RC-2 — Production Hardening).
- `http/` — `getClientIp.ts`, `verifyInternalSecret.ts`.

This is the only layer allowed to depend on external SDKs/HTTP clients directly.

### `src/shared/`

Cross-cutting utilities used across every module: `errors/` (the shared error taxonomy — `ValidationError`, `BusinessRuleError`, `DatabaseError`, `ExternalApiError`, `InfrastructureError`), `logger/` (the logging abstraction), `http/` (the timeout/retry HTTP helper used by every provider client), `types/`, `utils/`. Kept minimal by design.

### `src/config/`

`env.ts` (the only module allowed to read `process.env`, enforced by an ESLint rule) and `app.ts` (the structured `appConfig` built on top of it), plus `constants.ts` for infrastructure-level constants. See `docs/Development/Environment.md`.

## `src/components/`

Reusable, presentation-only React/UI components with no business logic: `layout/` (`PageContainer`, `Section`, `ContentWrapper`) and `ui/` (shadcn/ui-based primitives — `button.tsx`, `input.tsx`, `label.tsx` — added only as features required them).

## `src/features/`

Feature-oriented UI modules, one per parent-facing/admin concern (`landing/`, `lead/`, `lyrics/`, `song/`, `admin/`), each following the same internal shape: `components/` (React, `"use client"` where interactive), `hooks/` (client-side state/submission logic), `services/` (thin `fetch` wrappers typed against one specific API route, translating HTTP errors into typed error codes).

## `src/lib/`

`utils.ts` — small, framework-adjacent helpers (e.g. the `cn()` class-name helper used by UI components).

## `src/styles/`

`tokens.ts`, `theme.ts` — the Design System's token definitions (see `docs/Architecture/Design_System.md`).

## `prisma/`

`schema.prisma` (the relational schema — see `docs/Architecture/Database_Model.md`) and `migrations/` (one directory per migration, applied in order).

## `tests/`

Automated tests, mirroring `src/`'s layers: `domain/`, `application/`, `infrastructure/`, `features/`, `api/` (Route Handler tests), `app/` (page-level component tests), plus `e2e/` (Playwright), `stubs/` (test doubles, e.g. the `server-only` stub), and `setup/` (Vitest setup).
