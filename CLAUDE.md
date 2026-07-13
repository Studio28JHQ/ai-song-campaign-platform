# CLAUDE.md — Permanent Repository Memory

This document is the permanent memory of the AI Song Campaign Platform repository. It must be read and honored before any implementation work begins. It complements, and never contradicts, `PROJECT_MANIFEST.md`.

## What Project Is Being Developed

The AI Song Campaign Platform is a temporary, one-month marketing campaign Landing Page. It allows parents to register, have personalized song lyrics generated and previewed, approve those lyrics, and receive a final AI-generated song by email. An admin panel allows the campaign team to monitor submissions and export leads as CSV.

## Business Problem It Solves

Marketing needs a high-conversion, low-friction campaign asset that turns a landing page visit into a personalized, emotionally resonant deliverable (a song for their child) at scale — up to 3,000 unique songs — without building a general-purpose product or long-lived platform.

## Architecture That Must Always Be Followed

- Modular monolith. No microservices.
- Lightweight Domain Driven Design. Domain first.
- Clean Architecture — dependencies point inward, toward the domain.
- High cohesion, low coupling between modules.
- No unnecessary abstractions or speculative generality.

## Mandatory Design Patterns

- Repository Pattern for data access.
- Dependency Injection for wiring application services and infrastructure.

## Explicitly Forbidden

- Microservices architecture.
- Event-driven architecture (queues, event buses, pub/sub) for the core business flow.
- Multiple AI provider integrations (only the providers named in `PROJECT_MANIFEST.md`).
- Implementing Version 2 or Version 3 features inside Version 1 scope.
- Speculative scalability work — this is a temporary campaign, not a long-lived SaaS.
- Unnecessary abstractions, premature optimization, or framework churn.
- Leaving partially completed work committed to the repository.

## Documentation Rules

- `PROJECT_MANIFEST.md` is the project constitution. Any architectural or scope decision must be consistent with it.
- `CLAUDE.md` (this file) is permanent repository memory and must be kept current.
- `CHANGELOG.md` follows the Keep a Changelog format and must be updated for every completed feature or fix.
- Future enhancements beyond Version 1 must be recorded only in `BACKLOG_V2.md` (feature backlog) or `BACKLOG_V3.md` (optimization backlog) — never implemented ahead of schedule.
- Documentation lives under `docs/Architecture/`, `docs/Product/`, and `docs/Development/` according to its nature.

## Versioning Rules

- Follow Semantic Versioning for `CHANGELOG.md` entries (MAJOR.MINOR.PATCH).
- Start at `0.1.0` for initial documentation; increment MINOR for new features, PATCH for fixes, during pre-1.0 development.

## Commit Rules

Every completed feature must, in order:

1. Validate changes (tests, linting, type-checking, and manual verification where applicable).
2. Update affected documentation (`CHANGELOG.md` and any relevant docs under `docs/`).
3. Create a commit with a clear, conventional message describing the change.
4. Push to the remote repository.

Never leave partially completed work committed. A commit must represent a coherent, working state.

## Push Rules

- Push only after validation and documentation updates are complete.
- Do not force-push to shared branches.
- Do not push partially completed or broken work.

## Backlog Workflow

- Any idea, request, or improvement that falls outside Version 1 scope must be written into `BACKLOG_V2.md` (features) or `BACKLOG_V3.md` (optimizations) instead of being implemented.
- Do not silently drop out-of-scope requests — capture them in the appropriate backlog file so scope stays disciplined.

## Validation Workflow

- Before marking any feature complete, run the relevant automated checks (Vitest, Playwright, ESLint, Prettier) and confirm the change behaves correctly.
- Type-check the project before committing.
- Do not rely solely on type-checking as proof of correctness — verify actual behavior for anything with a runtime surface.

## How to Avoid Technical Debt

- Prefer evolving existing modules over introducing parallel implementations.
- Keep domain logic free of framework and infrastructure concerns.
- Do not add configuration, dependencies, or abstractions beyond what the current, in-scope feature requires.
- Resolve TODOs and partial implementations before committing; do not merge half-finished work.

## How to Avoid Unnecessary Rewrites

- Treat existing, working modules as stable. Modify them incrementally.
- Do not rewrite a module to "clean it up" unless the task requires changing its behavior.
- Prefer small, targeted diffs over large restructurings.

## How to Inspect Only Affected Modules Before Making Changes

- Before changing any code, identify the specific domain module(s) and layer(s) (domain, application, infrastructure, presentation) the change touches.
- Read only those modules and their direct collaborators/tests — avoid broad, unscoped exploration of unrelated areas.
- Confirm the module's existing contracts (interfaces, repository signatures) before altering them.

## How to Evolve Existing Functionality Instead of Rebuilding It

- Extend existing services, repositories, and components rather than replacing them wholesale.
- When a change seems to require a rewrite, first check whether the existing structure can accommodate the change with a smaller modification.
- Only replace a module entirely when it can no longer satisfy its contract and the task explicitly calls for it.

## Permanent Rule

All prompts in this repository are written in English, regardless of the conversation language.
