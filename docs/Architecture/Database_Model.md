# Database Model

This document describes the relational schema in `prisma/schema.prisma`. It is a companion to `docs/Architecture/Domain_Model.md` (conceptual entities) and `docs/Architecture/System_Architecture.md` (how the persistence layer fits the overall architecture). This file covers the _data model_: tables, relationships, constraints, and indexes — not repositories or query code, which belong to the Infrastructure layer and are out of scope here.

## Conventions

- Primary keys are `UUID` (`@default(uuid())`), matching Supabase/Postgres convention.
- Every table name is mapped (`@@map`) to a lowercase, snake_case, plural name (e.g. `Lead` → `leads`); model and field names stay camelCase/PascalCase to match the rest of the TypeScript codebase.
- `createdAt`/`updatedAt` timestamps are present on every entity except append-only logs (`GenerationAttempt`, `AuditLog`, `Lyrics`), which only need `createdAt`. `AuditLog` and `Lyrics` are immutable once written; a `GenerationAttempt` row is written twice by design — opened before the provider call and closed with its outcome — and records the second write in `completedAt` rather than in an `updatedAt` column (see below).

## Entities

### Campaign

Represents the single marketing campaign and its global constraints (see `docs/Architecture/Domain_Model.md#Campaign`). `maximumSongs`/`songsGenerated` track the campaign-wide song cap; `isGenerationEnabled` is an operational kill-switch independent of `status`, so generation can be paused without changing the campaign's lifecycle state. `status` (`DRAFT` / `ACTIVE` / `PAUSED` / `COMPLETED`) models the campaign's lifecycle. `gtmContainerId` (nullable, Feature 1 — GTM Configuration) is the campaign's only Google Tag Manager container id, editable from the Admin panel — the sole DB-backed global setting the schema currently exposes; `null`/empty disables GTM entirely.

### Consent

An anonymous, session-scoped record of a visitor accepting the Landing's cookie/privacy banner (Feature 2 — Privacy Consent Module; see `docs/Architecture/Domain_Model.md#Consent`). `sessionId` is globally unique — the database is the final enforcement point for "exactly one Consent per session, never duplicated." `leadId` is nullable and unique: `null` until (if ever) the visitor completes registration, at which point the existing row is associated by `sessionId` — never a second `Consent` — and unique because a Lead can never be linked to more than one Consent. `ipAddress`/`userAgent`/`policyVersion`/`acceptedAt` are captured once, at acceptance time, and never mutated afterward; only `leadId` (and therefore `updatedAt`) ever changes after creation.

### Lead

Represents a registered parent (see `docs/Architecture/Domain_Model.md#Lead`). `email` is globally unique — the database is the final enforcement point for "one email generates only one final song." `remainingAttempts` defaults to 5 and is protected by a `CHECK` constraint so it can never go negative at the database level, regardless of what application code does. `status` models where the lead currently is in the flow described in `docs/Product/User_Flow.md`.

### Mood

The four predefined moods (see `docs/Product/Business_Rules.md#Mood-Rules`). `name` is unique; `sunoPrompt` holds the fixed prompt mapped to that mood; `active`/`displayOrder` support showing/ordering moods on the Landing Page without touching code. Moods are a small, fixed reference table — deleting one while it's referenced by lyrics or songs is intentionally blocked (see Constraints).

### Lyrics

Every generated lyrics version for a lead (see `docs/Architecture/Domain_Model.md#Lyrics`). `version` is scoped per lead (`(leadId, version)` unique) so versions are numbered independently per lead. `approved` plus a partial unique index guarantee at most one approved version per lead, matching "only one may become the approved version." `rejectionReason` captures why a version was not accepted (moderation or otherwise); it is nullable since most versions won't need one.

### GenerationAttempt

An audit trail of every interaction with Claude, including the attempts that fail before producing lyrics. `attemptNumber` is unique per lead so attempts are strictly ordered and never collide. `lyricsId` is optional and unique — designed so an attempt could point at the `Lyrics` row it produced — and is currently always `null` (see below). `result` distinguishes `STARTED` / `SUCCESS` / `MODERATION_REJECTED` / `FAILED`.

**Populated as of Sprint FINAL-2 — Lyrics Generation Traceability.** One row per _real Claude call_, written by `ClaudeLyricsService` through the `LyricsAttemptRecorder` port and read back by the Admin lead-detail screen through `AdminLyricsAttemptGate`.

- **`attemptNumber` is not the parent's attempt count.** It counts the provider calls actually issued for a lead, over the lead's whole lifetime. The attempts rule (see `docs/Product/Business_Rules.md#Attempts-Rules`) is still enforced exclusively through `Lead.remainingAttempts`, and the two numbers diverge by design: an over-long lyric is retried internally at no cost to the parent, so one functional attempt produces one row normally, two when the retry succeeds, and three at most (one initial call plus the two retries `LYRICS_TOO_LONG_RETRY_LIMIT` allows). Neither number is derivable from the other.
- **`STARTED` is a pre-call marker**, written before the request so a call that never returns still leaves evidence, and replaced by a terminal value when the call finishes. `completedAt` is set at that point. Nothing rewrites a `STARTED` row afterwards: `result = STARTED` with a null `completedAt` means "opened, never closed", and whether that is a request in flight or one killed mid-call is judged from the row's age by whoever reads it.
- **`errorCode`** holds a normalised, stable cause (`CLAUDE_OUTPUT_TOO_LONG`, `CLAUDE_INVALID_RESPONSE`, `CLAUDE_RATE_LIMIT`, `CLAUDE_API_ERROR`, `CLAUDE_UNAVAILABLE`, `LYRICS_VALIDATION_ERROR`, `INTERNAL_ERROR`) rather than the raw provider code, so failures stay groupable. It is `null` for anything that is not a `FAILED` attempt — a moderation rejection is an outcome, not an error. **`failureReason`** holds only a message this codebase wrote itself; provider error _contexts_ are deliberately never stored, since they can contain the raw response and therefore the parent's own message. **`providerModel`** names the model that produced the row.
- **`lyricsId` stays `null`.** Linking an attempt to the `Lyrics` row it produced would require the use case to write back after persistence; the attempt's own outcome already answers every question this table exists to answer.
- **Rows exist only for generations made after the tracing was added.** Nothing was backfilled: a lead with no rows genuinely has no recorded calls, which is a more useful fact than invented history.
- **Writing a row can never affect a generation.** Every recorder call is best-effort — a failure is logged and nothing else (see `docs/Development/Error_Handling.md`).

### Song

The final generated audio deliverable (see `docs/Architecture/Domain_Model.md#Song`). `leadId` is unique, enforcing "one Lead must never own more than one final song" directly at the database level via a `UNIQUE` constraint — not just an application-level check. `provider` is a plain string defaulted to `"mureka"` rather than an enum, deliberately: the project uses a single music provider by design (see `PROJECT_MANIFEST.md` — Engineering Principles), so there is no set of alternatives to enumerate. `generatedAt`, `completedAt`, and `emailedAt` are tracked separately from `status` since a song can be generated but not yet emailed, and `completedAt` covers both a success and a failure outcome while `generatedAt` only ever gets set on success.

**Provider metadata (Sprint 9.1)** — `providerTaskId`/`providerTraceId` are the in-flight submission identifiers `GenerationDispatcher` persists before the provider has finished; `providerStatus`/`providerError` mirror the provider's own last-reported state, for diagnostics only, never for domain transitions; `submittedAt` records when the dispatcher submitted the job. `audioStorageKey` is the _only_ durable reference to the generated audio — a Cloudflare R2 object key, persisted by `GenerationPoller`. Neither a signed URL nor the provider's own URL is ever persisted anywhere in this table (or anywhere else) — every consumer resolves a fresh signed URL at read time via `AudioUrlResolver` (see `docs/Architecture/External_Services.md` — Cloudflare R2).

### AdminUser

A campaign administrator (see `docs/Architecture/Domain_Model.md#Admin`). `role` is a plain string defaulted to `"admin"` rather than an enum — Version 1 supports a single administrator/role (see `docs/Product/Business_Rules.md#Admin-Rules`); a fixed role enum would be speculative ahead of `BACKLOG_V2.md`'s "multiple administrators" work. Admins are deactivated (`active = false`), never deleted, so `AuditLog` history always remains attributable.

### AuditLog

Tracks administrative actions (CSV export, viewing a lead, etc.). `entity`/`entityId` are a deliberately loose, polymorphic reference (plain strings, no foreign key) since a single audit log spans every other entity type; enforcing a real foreign key per entity type would require either a separate log table per entity or a much heavier polymorphic-association pattern, which this campaign-scale system doesn't need. `metadata` is a `Json` field for free-form, action-specific detail.

## Relationships

```
Campaign 1 ──< Lead
Lead     1 ──< Lyrics
Lead     1 ──1 Song            (at most one)
Lead     1 ──< GenerationAttempt
Lead     1 ──1 Consent         (at most one, and only once registered)
Mood     1 ──< Lyrics
Mood     1 ──< Song
Lyrics   1 ──1 GenerationAttempt (designed link, currently never set)
Lyrics   1 ──< Song             (a lyrics version may back a song)
AdminUser 1 ──< AuditLog
```

## Constraints

| Constraint                                   | Mechanism                                                                                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Unique email per lead                        | `@unique` on `Lead.email`                                                                                                        |
| One final song per lead                      | `@unique` on `Song.leadId`                                                                                                       |
| Remaining attempts cannot be negative        | Hand-added `CHECK` constraint in the migration SQL (Prisma's schema DSL has no `CHECK` syntax)                                   |
| At most one approved lyrics version per lead | Hand-added partial unique index (`WHERE approved = true`) in the migration SQL (Prisma's schema DSL has no partial-index syntax) |
| Attempt numbers don't collide per lead       | `@@unique([leadId, attemptNumber])` on `GenerationAttempt`                                                                       |
| Lyrics versions don't collide per lead       | `@@unique([leadId, version])` on `Lyrics`                                                                                        |
| Exactly one Consent per session              | `@unique` on `Consent.sessionId`                                                                                                 |
| At most one Consent per lead                 | `@unique` on `Consent.leadId`                                                                                                    |
| Cascade deletes only where appropriate       | See table below                                                                                                                  |

### Delete behavior

| Relationship                         | On delete  | Reasoning                                                                                                                                |
| ------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Lead → Campaign                      | `Restrict` | A campaign must not be deletable while it still has leads; prevents accidental mass data loss.                                           |
| Lyrics/GenerationAttempt/Song → Lead | `Cascade`  | Deleting a lead (e.g. a data-erasure request) removes all of that lead's data with it.                                                   |
| Lyrics/Song → Mood                   | `Restrict` | Moods are a small, fixed reference set; deleting one must not silently orphan or destroy historical lyrics/songs.                        |
| Song → Lyrics                        | `Restrict` | The lyrics version behind a generated song must not be deletable out from under it.                                                      |
| GenerationAttempt → Lyrics           | `SetNull`  | The attempt log is an audit trail; it should survive even if the lyrics row it produced is later removed.                                |
| Consent → Lead                       | `SetNull`  | A Consent record is anonymous by design; it must survive (reverting to unassociated) even if the Lead it was later linked to is removed. |
| AuditLog → AdminUser                 | `Restrict` | Preserves audit trail integrity; admins are deactivated, not deleted.                                                                    |

## Indexes

Beyond the unique constraints above:

- `email` — covered by the unique index on `Lead.email`.
- `status` — indexed on `Campaign.status` and `Lead.status`.
- `campaign` — indexed on `Lead.campaignId` (foreign key lookups).
- `createdAt` — indexed on `Lead`, `GenerationAttempt`, `Song`, and `AuditLog` for time-ordered queries (e.g. admin views, CSV export).
- `song status` — indexed on `Song.status`.
- `generation status` — indexed on `GenerationAttempt.result`.
- `AuditLog(entity, entityId)` — composite index for "show me the history of this record."

## Business Reasoning

This schema exists to make the Business Rules in `docs/Product/Business_Rules.md` structurally impossible to violate wherever the database can enforce them directly (unique email, one song per lead, non-negative attempts, one approved lyrics version), rather than relying solely on application-layer checks. Everything else — _when_ an attempt should be consumed, _which_ status transitions are valid, _how_ CSV export is generated — is intentionally left out of the schema; it belongs to the Application/Domain layers per `PROJECT_MANIFEST.md`'s Clean Architecture and Repository Pattern requirements, and to a future task.

## Future Expansion Considerations

- **Multiple songs per lead / multiple administrators / additional moods** (see `BACKLOG_V2.md`) would each require relaxing a constraint introduced here (`Song.leadId` uniqueness, a real `AdminUser.role` enum, or simply inserting more `Mood` rows) rather than a schema rewrite.
- **Soft deletes / GDPR erasure** for leads is not modeled yet (deletes are hard, cascading deletes); if required, a `deletedAt` column would be a small, additive change.
- **Prisma cannot express `CHECK` constraints or partial indexes natively** — both are currently maintained by hand in `prisma/migrations/20260713195728_init/migration.sql`. Any future schema change must re-apply (or `prisma migrate diff` may drop) these two hand-added statements; check the generated SQL before applying a new migration.
