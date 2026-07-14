# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
