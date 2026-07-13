# Git Workflow

## Branch Strategy

- `main` is the single long-lived branch, always kept in a working, deployable state.
- Feature work happens in short-lived branches cut from `main` (e.g. `feature/lyrics-regeneration`) and merged back promptly — given the campaign's short lifespan, branches should not live long enough to drift.
- No parallel long-term branches (e.g. `develop`, `release/*`) — unnecessary for a one-month, single-environment campaign.

## Commit Conventions

Use Conventional Commits prefixes:

- `docs:` — documentation-only changes.
- `feat:` — new feature or capability.
- `fix:` — bug fix.
- `refactor:` — internal restructuring with no behavior change.
- `test:` — adding or updating tests only.
- `chore:` — tooling, maintenance, or housekeeping changes.

Each commit should represent one logical, complete unit of work.

## Push Policy

- Push only after validation passes and documentation is updated.
- Push promptly after a feature is complete — do not accumulate unpushed local commits.
- Never force-push to `main`.

## Documentation Updates

- Any change to scope, architecture, business rules, or workflow must update the relevant file under `docs/`, plus `PROJECT_MANIFEST.md` and/or `CLAUDE.md` when the change affects project-wide rules.
- Every completed feature updates `CHANGELOG.md`.

## Hard Rules

- Never commit broken code.
- Never skip validation (tests, lint, type-check) before committing.
- Never leave TODOs without a corresponding reference in `BACKLOG_V2.md` or `BACKLOG_V3.md`.
