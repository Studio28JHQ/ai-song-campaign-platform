# Database Model

This document describes the relational schema in `prisma/schema.prisma`. It is a companion to `docs/Architecture/Domain_Model.md` (conceptual entities) and `docs/Architecture/System_Architecture.md` (how the persistence layer fits the overall architecture). This file covers the _data model_: tables, relationships, constraints, and indexes — not repositories or query code, which belong to the Infrastructure layer and are out of scope here.

## Conventions

- Primary keys are `UUID` (`@default(uuid())`), matching Supabase/Postgres convention.
- Every table name is mapped (`@@map`) to a lowercase, snake_case, plural name (e.g. `Lead` → `leads`); model and field names stay camelCase/PascalCase to match the rest of the TypeScript codebase.
- `createdAt`/`updatedAt` timestamps are present on every entity except append-only logs (`GenerationAttempt`, `AuditLog`, `Lyrics`), which are immutable once written and so only need `createdAt`.

## Entities

### Campaign

Represents the single marketing campaign and its global constraints (see `docs/Architecture/Domain_Model.md#Campaign`). `maximumSongs`/`songsGenerated` track the campaign-wide song cap; `isGenerationEnabled` is an operational kill-switch independent of `status`, so generation can be paused without changing the campaign's lifecycle state. `status` (`DRAFT` / `ACTIVE` / `PAUSED` / `COMPLETED`) models the campaign's lifecycle.

### Lead

Represents a registered parent (see `docs/Architecture/Domain_Model.md#Lead`). `email` is globally unique — the database is the final enforcement point for "one email generates only one final song." `remainingAttempts` defaults to 5 and is protected by a `CHECK` constraint so it can never go negative at the database level, regardless of what application code does. `status` models where the lead currently is in the flow described in `docs/Product/User_Flow.md`.

### Mood

The four predefined moods (see `docs/Product/Business_Rules.md#Mood-Rules`). `name` is unique; `sunoPrompt` holds the fixed prompt mapped to that mood; `active`/`displayOrder` support showing/ordering moods on the Landing Page without touching code. Moods are a small, fixed reference table — deleting one while it's referenced by lyrics or songs is intentionally blocked (see Constraints).

### Lyrics

Every generated lyrics version for a lead (see `docs/Architecture/Domain_Model.md#Lyrics`). `version` is scoped per lead (`(leadId, version)` unique) so versions are numbered independently per lead. `approved` plus a partial unique index guarantee at most one approved version per lead, matching "only one may become the approved version." `rejectionReason` captures why a version was not accepted (moderation or otherwise); it is nullable since most versions won't need one.

### GenerationAttempt

An audit trail of every interaction with Claude (see `docs/Product/Business_Rules.md#Attempts-Rules`), including attempts that fail before producing lyrics. `attemptNumber` is unique per lead so attempts are strictly ordered and never collide. `lyricsId` is optional and unique — an attempt produces at most one `Lyrics` row (on success), and a `Lyrics` row traces back to exactly one originating attempt. `result` distinguishes `SUCCESS` / `MODERATION_REJECTED` / `FAILED`; deciding _whether_ a given result consumes one of the lead's five attempts is business logic that belongs to the application layer, not to this table.

### Song

The final generated audio deliverable (see `docs/Architecture/Domain_Model.md#Song`). `leadId` is unique, enforcing "one Lead must never own more than one final song" directly at the database level via a `UNIQUE` constraint — not just an application-level check. `provider` is a plain string defaulted to `"suno"` rather than an enum, deliberately: the project uses a single music provider by design (see `PROJECT_MANIFEST.md` — Engineering Principles), so there is no set of alternatives to enumerate. `generatedAt` and `emailedAt` are tracked separately from `status` since a song can be generated but not yet emailed.

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
Mood     1 ──< Lyrics
Mood     1 ──< Song
Lyrics   1 ──1 GenerationAttempt (the attempt that produced it, if any)
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
| Cascade deletes only where appropriate       | See table below                                                                                                                  |

### Delete behavior

| Relationship                         | On delete  | Reasoning                                                                                                         |
| ------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Lead → Campaign                      | `Restrict` | A campaign must not be deletable while it still has leads; prevents accidental mass data loss.                    |
| Lyrics/GenerationAttempt/Song → Lead | `Cascade`  | Deleting a lead (e.g. a data-erasure request) removes all of that lead's data with it.                            |
| Lyrics/Song → Mood                   | `Restrict` | Moods are a small, fixed reference set; deleting one must not silently orphan or destroy historical lyrics/songs. |
| Song → Lyrics                        | `Restrict` | The lyrics version behind a generated song must not be deletable out from under it.                               |
| GenerationAttempt → Lyrics           | `SetNull`  | The attempt log is an audit trail; it should survive even if the lyrics row it produced is later removed.         |
| AuditLog → AdminUser                 | `Restrict` | Preserves audit trail integrity; admins are deactivated, not deleted.                                             |

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
