# Domain Model

This document describes the domain model as delivered. See `docs/Architecture/Folder_Structure.md` for where each module lives (`src/domain/`, `src/application/`).

## Lead

**Purpose** — Represents a person (parent) who registered on the Landing Page to generate a song. Implemented as an aggregate root at `src/domain/lead/entities/Lead.ts`.

**Responsibilities** — Holds the registrant's identity (parent name, baby name, baby age, city, email, phone) and personalization inputs; is the anchor record tying together lyrics and the final song. Enforces its own invariants rather than trusting callers to — nothing outside the entity can put a `Lead` into an invalid state.

**Invariants** (enforced by the entity itself, not by infrastructure):

- `parentName`, `babyName`, and `email` are mandatory — construction fails otherwise.
- `email`, `phone`, and `babyAge` are represented by self-validating value objects (`Email`, `PhoneNumber`, `BabyAge` in `src/domain/lead/value-objects/`) that reject malformed input. This is _structural_ validation only (is the string shaped like an email/phone? is the age a plausible integer?) — uniqueness of email and any deliverability/carrier checks are infrastructure/application concerns handled elsewhere.
- `remainingAttempts` can never be negative, and can never exceed the campaign's configured maximum (passed in at creation/rehydration — not stored redundantly on the Lead itself).
- Attempts can only be consumed while the lead is in the `GENERATING` state; consuming the last attempt automatically transitions the lead to `BLOCKED` so that invariant can't be forgotten by a caller.
- Status transitions are only ever performed through explicit methods (`startGenerating`, `complete`, `block`, `fail`) — there is no public setter for status.

**State Transitions** — `LeadStatus` (`src/domain/lead/types/index.ts`) is intentionally coarser than the persistence-layer `LeadStatus` enum in `prisma/schema.prisma`: the domain-level status only tracks the Lead aggregate's own lifecycle, while the finer-grained states (lyrics approved, song ready, ...) belong to the `Lyrics`/`Song` aggregates.

```
REGISTERED ──▶ GENERATING ──▶ COMPLETED
                   │
                   ├──▶ BLOCKED   (attempts exhausted)
                   └──▶ FAILED    (unrecoverable error)
```

`COMPLETED`, `BLOCKED`, and `FAILED` are terminal — no further transitions are allowed out of them.

**Relationships** — One Lead has one associated email (unique, enforced at the database — see `docs/Architecture/Database_Model.md`). One Lead has one Campaign context (referenced by `campaignId`; the Campaign's maximum-attempts value is supplied to the Lead rather than looked up by it, keeping the two decoupled). One Lead has many Lyrics versions. One Lead has, at most, one accepted Lyrics and one final Song. The persistence contract is `LeadRepository` (`src/domain/lead/repositories/LeadRepository.ts`), implemented by `PrismaLeadRepository` (`src/infrastructure/persistence/prisma/lead/`).

### Application Layer — Lead

`src/application/lead/` orchestrates the `Lead` aggregate: `CreateLeadUseCase` validates the email's structural format, checks `LeadRepository.existsByEmail` (the enforcement point for "one email address can participate only once" — the database's unique constraint on `Lead.email` is the final backstop), reads the campaign's maximum lyric attempts from the small `LeadCampaignConfig` port, and persists the new `Lead` via `LeadRepository.create`. Wired into `POST /api/leads` (`app/api/leads/route.ts`).

## Lyrics

**Purpose** — Represents one generated lyrics version produced for a Lead's personalization input. Implemented as an aggregate root at `src/domain/lyrics/entities/Lyrics.ts`. This aggregate manages lyrics _versions_ only; the actual generation call to Claude is a separate infrastructure concern (`ClaudeLyricsService`, see `docs/Architecture/External_Services.md`) that calls into this module with already-generated content.

**Responsibilities** — Holds the generated text, the prompt it was generated from, its mood, and whether it has been accepted, rejected, or is still pending. Enforces its own invariants rather than trusting callers to.

**Invariants** (enforced by the entity itself, not by infrastructure):

- `leadId`, `moodId`, `prompt`, and `content` are mandatory — construction fails otherwise.
- `version` must be a positive integer.
- A version cannot be approved twice (`approve()` throws if `approved` is already `true`).
- A rejected version can never be approved, and an approved version can never be rejected — `approved` and a set `rejectionReason` are mutually exclusive terminal outcomes for a given version.

**Lifecycle / Approval Process** — Each generation call for a Lead produces a new Lyrics version (a Lead may have multiple). A version starts pending (`approved: false`, `rejectionReason: null`) and ends in exactly one of two terminal states: **approved** (via `approve()` — the only version a Song may later be generated from) or **rejected** (via `reject(reason)` — e.g. moderation, or superseded by the user requesting a regeneration). "Only one Lyrics record can be marked as approved" is a _cross-record_ rule the entity cannot enforce alone; that check belongs to `ApproveLyricsUseCase`, backstopped by a database partial unique index (see `docs/Architecture/Database_Model.md`).

**Relationships** — Belongs to one Lead (a Lead may have many Lyrics — one per generation attempt). References one Mood. At most one Lyrics per Lead is ever approved; that approved Lyrics is the only one a Song may later be generated from. The persistence contract is `LyricsRepository` (`src/domain/lyrics/repositories/LyricsRepository.ts`), implemented by `PrismaLyricsRepository` (`src/infrastructure/persistence/prisma/lyrics/`).

### Application Layer — Lyrics

`src/application/lyrics/` has two use cases: `GenerateLyricsUseCase` (version bookkeeping only — derives the next version number, persists a new `Lyrics`) and `ApproveLyricsUseCase` (looks up the Lyrics by id, checks the lead has no other approved version, calls `lyrics.approve()`, persists). Neither one calls Claude directly. The orchestration that actually validates a lead, consumes attempts, and calls Claude is `GenerateLyricsForLeadUseCase` (see `docs/Architecture/System_Architecture.md` — Lyrics Generation Request Sequence), which composes `GenerateLyricsUseCase` internally. Wired into `POST /api/lyrics/generate` and `POST /api/lyrics/approve`.

## Song

**Purpose** — Represents the one final, generated audio deliverable for a Lead. Implemented as an aggregate root at `src/domain/song/entities/Song.ts`.

**Responsibilities** — References the accepted Lyrics and selected Mood used to generate it; tracks its own generation state machine and the resulting `audioStorageKey`/`duration`; tracks whether it has been emailed. It only tracks state — it never talks to Mureka itself (that is `MurekaSongService`'s job, called by the application layer).

**Invariants / State Transitions** (enforced by the entity itself):

```
QUEUED ──▶ GENERATING ──▶ COMPLETED
               │  ▲
               └──┴──▶ FAILED ──▶ QUEUED      (manual admin retry)
                       FAILED ──▶ GENERATING  (retry re-submission)
```

`COMPLETED` is terminal — a song can only ever succeed once (`Song.leadId` is unique at the database level, so a lead's one-song slot is never occupied by more than one row). `markCompleted()` requires a non-empty `providerSongId` and `audioStorageKey` (the Cloudflare R2 object key — never a provider or signed URL, see `docs/Architecture/External_Services.md` — Cloudflare R2). `retryFromFailure()` resets a `FAILED` song back to `QUEUED` without touching its lyrics/mood/provider references, so a retry always reuses the exact same row. A `Song` stuck `GENERATING` past `GENERATION_TIMEOUT_MINUTES` is reclaimed automatically by `GenerationDispatcher` (RC-2 — Production Hardening).

**Relationships** — Belongs to exactly one Lead (unique). Generated from exactly one accepted Lyrics and one Mood. The persistence contract is `SongRepository` (`src/domain/song/repositories/SongRepository.ts`), implemented by `PrismaSongRepository` (`src/infrastructure/persistence/prisma/song/`).

### Application Layer — Song

`src/application/song/` has three use cases, split specifically because song generation runs in the background (see `docs/Architecture/System_Architecture.md` — Asynchronous Song Generation): `GenerateSongUseCase` (synchronous intake — validates the lead/campaign/lyrics state, persists `Song` as `QUEUED`, returns immediately), `GenerationDispatcher` (submits the oldest `QUEUED` song to Mureka, persists the submission details), and `GenerationPoller` (polls for completion, downloads and stores the audio in R2, marks `COMPLETED`/`FAILED`, triggers the one-time email). Two narrow ports fill in for concepts with no dedicated aggregate: `CampaignGate` (is the campaign active and generation-enabled?) and `MoodSunoPromptProvider` (the mood's fixed prompt) — see "Campaign" and "Mood" below.

## Campaign

**Purpose** — The overall one-month marketing campaign and its global constraints (active window, song cap).

**Implementation status** — There is no `Campaign` domain aggregate in `src/domain/`. `Campaign` exists only as a Prisma model (see `docs/Architecture/Database_Model.md`); the one thing the application layer needs from it — "is this campaign active and is generation enabled?" — is satisfied by the narrow `CampaignGate` port (`src/application/song/contracts/CampaignGate.ts`), backed by a thin Prisma adapter (`PrismaCampaignGate`). This was a deliberate simplification during implementation, not an oversight: a full aggregate would add a repository and lifecycle rules with no current caller.

**Relationships** — One Campaign has many Leads. Leads cannot be registered outside the Campaign's active window or once its song cap is reached (enforced at the application layer where each rule is actually checked, not by a `Campaign` entity).

## Mood

**Purpose** — One of the four predefined moods a user can select for their song.

**Implementation status** — Like Campaign, there is no `Mood` domain aggregate. `Mood` is a small, fixed Prisma reference table (see `docs/Architecture/Database_Model.md`); the one thing the Song flow needs — a mood's name and fixed generation prompt — is satisfied by the narrow `MoodSunoPromptProvider` port, backed by a thin Prisma adapter.

**Relationships** — Selected once per Lead's personalization. Used as an input to Lyrics and Song generation.

## GenerationAttempt

**Purpose (as designed)** — Intended as a per-attempt audit trail of every interaction with Claude, including attempts that fail before producing lyrics (see `docs/Architecture/Database_Model.md`).

**Implementation status** — The `GenerationAttempt` Prisma model exists in the schema but is never written to or read by any current code path (verified: no reference outside the generated Prisma client). The five-attempts business rule (see `docs/Product/Business_Rules.md`) is fully enforced today through a simpler mechanism — `Lead.remainingAttempts`, a single counter decremented by `GenerateLyricsForLeadUseCase` — which is sufficient for the rule as written. The practical effect: a moderation-rejected attempt that never produced a `Lyrics` row leaves no individual record of itself (only the decremented counter), so the Admin execution history (see `docs/Product/User_Flow.md`) cannot show it as a distinct timeline event. See `BACKLOG_V3.md` for wiring this table up as a real audit trail.

## Admin

**Purpose** — The campaign administrator who monitors submissions and exports data. Implemented as `AdminUser` (`src/domain/admin/entities/AdminUser.ts`) and `AuditLogEntry` (`src/domain/admin/entities/AuditLogEntry.ts`).

**`AdminUser`** — Models only the login lifecycle: `assertCanAuthenticate()` (throws if the account is deactivated) and `recordLogin()` (stamps `lastLogin`). There is no create/edit flow — accounts are provisioned directly against the database (see `docs/Architecture/System_Architecture.md` — Authentication Flow). Version 1 supports a single administrator (see `BACKLOG_V2.md` for multiple administrators/roles).

**`AuditLogEntry`** — An immutable record of an administrative action (`login`, `view_lead`, `retry_song`, `resend_email`), backed by the `AuditLog` Prisma model. Persistence contracts: `AdminUserRepository` and `AuditLogRepository` (`src/domain/admin/repositories/`), implemented by `PrismaAdminUserRepository`/`PrismaAuditLogRepository`.

**Relationships** — Not tied to a specific Lead; operates across the whole Campaign.

### Application Layer — Admin

`src/application/admin/` covers authentication (`LoginUseCase`), read-only reporting (`GetDashboardSummaryUseCase`, `SearchLeadsUseCase`, `GetLeadDetailUseCase`, `ExportLeadsUseCase`), and operational recovery (`RetryFailedSongUseCase`, `ResendSongEmailUseCase`). The reporting use cases are pure reads composed directly over the `Lead`/`Lyrics`/`Song` repositories plus two narrow ports for cross-aggregate reads (`AdminDashboardGate`, `AdminLeadSearchGate`) and one for CSV export (`AdminLeadExportGate`) — no parallel read model. See `docs/Architecture/System_Architecture.md` for the full request sequences.
