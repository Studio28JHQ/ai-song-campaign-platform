# Development Workflow

## Feature-First Development

Work is organized around complete, vertical features (e.g. "lyrics regeneration", "CSV export") rather than horizontal technical layers. A feature is not done until it works end-to-end for its scope.

## Small Incremental Changes

Prefer a sequence of small, reviewable changes over large, sweeping ones. Each change should be easy to reason about and easy to revert independently.

## Always Inspect Affected Modules Only

Before implementing a change, identify the specific domain/application/infrastructure/presentation module(s) it touches and read only those and their direct collaborators. Avoid broad, unscoped exploration of unrelated parts of the codebase.

## Always Update Documentation

Any change that affects scope, architecture, business rules, or workflow must be reflected in the relevant document (`PROJECT_MANIFEST.md`, `CLAUDE.md`, `docs/Architecture/`, `docs/Product/`, `docs/Development/`) and in `CHANGELOG.md`.

## Always Validate Before Commit

Run the relevant checks — Vitest, Playwright (where applicable), ESLint, Prettier, and type-checking — and confirm the feature behaves correctly before committing.

## Never Leave Partial Implementations

A commit must represent a coherent, working state. Do not commit half-finished features, unresolved TODOs, or broken builds.

## One Logical Commit Per Completed Feature

Each completed feature or fix is committed as a single, well-scoped commit with a clear, conventional message describing the change.

## Always Push After Successful Validation

Once a feature is validated, documented, and committed, push it to the remote repository. Do not accumulate unpushed, completed work.
