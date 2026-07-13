# Folder Structure

This document describes the future repository organization. It is documentation only — none of the folders described below are created by this document.

## `app/`

Next.js App Router entry point: pages, layouts, and Route Handlers (API endpoints). Contains only routing and thin request/response wiring; delegates business logic to `src/application`.

## `src/`

Root of the application source code, organized by layer following Clean Architecture.

### `src/domain/`

Core business entities, value objects, and domain rules (leads, emails, attempts, moods, lyrics, songs). No framework or infrastructure imports. Domain first.

### `src/application/`

Use cases / application services that orchestrate domain logic (e.g. register lead, moderate content, generate lyrics, accept lyrics, generate song, deliver email). Depends on domain and on repository/service interfaces, not on concrete infrastructure.

### `src/infrastructure/`

Concrete implementations of the interfaces defined in `application`: Prisma-backed repositories, Claude client adapter, Suno client adapter, Resend client adapter, Supabase Storage adapter. This is the only layer allowed to depend on external SDKs directly.

### `src/shared/`

Cross-cutting utilities and types shared across layers that do not belong to a single domain concept (e.g. generic result/error types, constants). Kept minimal to avoid becoming a dumping ground.

## `components/`

Reusable, presentation-only React/UI components (shadcn/ui-based), with no direct business logic or data-fetching concerns.

## `features/`

Feature-oriented UI modules that compose `components/` and call into `app/` Route Handlers or application use cases for a specific part of the flow (e.g. registration form, lyrics preview, admin dashboard).

## `lib/`

Framework-adjacent helpers and integration glue (e.g. Prisma client instance, DI wiring/container setup, validation schemas) that support `infrastructure/` and `app/` without containing business rules themselves.

## `types/`

Shared TypeScript type definitions used across the frontend and backend where colocating them with a specific layer would create unnecessary coupling.

## `tests/`

Automated tests: Vitest unit/integration tests mirroring the `src/` layers, and Playwright end-to-end tests covering the main user flow and its failure scenarios.

## `docs/`

Project documentation: `Architecture/`, `Product/`, and `Development/`, as already established in this repository.
