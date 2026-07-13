# Domain Model

This document describes the initial domain model at a conceptual level only. It does not define code, schemas, or implementation details — see `docs/Architecture/Folder_Structure.md` for where this will eventually live (`src/domain/`).

## Lead

**Purpose** — Represents a person (parent) who registered on the Landing Page to generate a song. Implemented as an aggregate root at `src/domain/lead/entities/Lead.ts`.

**Responsibilities** — Holds the registrant's identity (parent name, baby name, baby age, city, email, phone) and personalization inputs; is the anchor record tying together attempts, lyrics, and the final song. Enforces its own invariants rather than trusting callers to — nothing outside the entity can put a `Lead` into an invalid state.

**Invariants** (enforced by the entity itself, not by infrastructure):

- `parentName`, `babyName`, and `email` are mandatory — construction fails otherwise.
- `email`, `phone`, and `babyAge` are represented by self-validating value objects (`Email`, `PhoneNumber`, `BabyAge` in `src/domain/lead/value-objects/`) that reject malformed input. This is _structural_ validation only (is the string shaped like an email/phone? is the age a plausible integer?) — uniqueness of email and any deliverability/carrier checks are infrastructure/application concerns handled elsewhere.
- `remainingAttempts` can never be negative, and can never exceed the campaign's configured maximum (passed in at creation/rehydration — not stored redundantly on the Lead itself, since it belongs to the `Campaign` aggregate).
- Attempts can only be consumed while the lead is in the `GENERATING` state; consuming the last attempt automatically transitions the lead to `BLOCKED` so that invariant can't be forgotten by a caller.
- Status transitions are only ever performed through explicit methods (`startGenerating`, `complete`, `block`, `fail`) — there is no public setter for status.

**State Transitions** — `LeadStatus` (`src/domain/lead/types/index.ts`) is intentionally coarser than the persistence-layer `LeadStatus` enum in `prisma/schema.prisma`: the domain-level status only tracks the Lead aggregate's own lifecycle, while the finer-grained states (moderation rejected, lyrics approved, song ready, ...) will belong to the `Lyrics`/`Song` aggregates once they're implemented.

```
REGISTERED ──▶ GENERATING ──▶ COMPLETED
                   │
                   ├──▶ BLOCKED   (attempts exhausted)
                   └──▶ FAILED    (unrecoverable error)
```

`COMPLETED`, `BLOCKED`, and `FAILED` are terminal — no further transitions are allowed out of them.

**Relationships** — One Lead has one associated email (unique). One Lead has one Campaign context (referenced by `campaignId`; the Campaign's maximum-attempts value is supplied to the Lead rather than looked up by it, keeping the two aggregates decoupled). One Lead has many GenerationAttempts. One Lead has, at most, one accepted Lyrics and one final Song. The persistence contract for this aggregate is `LeadRepository` (`src/domain/lead/repositories/LeadRepository.ts`) — interface only, no implementation yet.

## Application Layer — Lead

The Application layer (`src/application/lead/`) orchestrates the `Lead` aggregate. It contains use cases, DTOs, and small application-level contracts — never persistence, HTTP, or infrastructure validation. It depends on the domain layer (entities, value objects, `LeadRepository`); the domain layer never depends back on it.

**Responsibilities of this layer:**

- Translate boundary-facing DTOs (`CreateLeadRequest`) into calls against the domain (`Lead.create`) and the `LeadRepository` contract.
- Enforce cross-cutting rules that need a repository lookup — the domain entity alone cannot know whether an email is already registered (that requires a query), so the use case checks `LeadRepository.existsByEmail` before creating anything.
- Supply configuration the domain needs but shouldn't reach for itself. `Lead.create` requires a `maxAttempts` value; the use case obtains it from a small `LeadCampaignConfig` port (`getMaxLyricAttempts()`) rather than importing `@/config` directly, so the use case stays testable with a fake and swappable without touching this layer.
- Return DTOs (`CreateLeadResponse`, carrying a `LeadSnapshot`) — never the `Lead` entity itself — so nothing outside the application layer can call domain methods directly.

### CreateLeadUseCase

`src/application/lead/use-cases/CreateLeadUseCase.ts`. Given a `CreateLeadRequest`:

1. Validates the email's structural format via the `Email` value object (fails fast, before any repository call).
2. Calls `LeadRepository.existsByEmail` — if the email is already registered, the use case rejects with a business-rule error. This is the enforcement point for "one email address can participate only once" at the application level (the database-level uniqueness constraint in `docs/Architecture/Database_Model.md` is the final backstop).
3. Reads the campaign's maximum lyric attempts from `LeadCampaignConfig` and passes it to `Lead.create`, so a new lead's `remainingAttempts` — and its initial `status` of `REGISTERED` — come entirely from the domain entity's own construction logic, not from ad hoc application code.
4. Persists the new `Lead` via `LeadRepository.create`.
5. Returns a `CreateLeadResponse` wrapping the persisted lead's snapshot.

No Prisma/Supabase repository, API route, controller, or UI exists yet — `LeadRepository` remains an interface, satisfied only by a test double until the Infrastructure layer implements it.

## Song

**Purpose** — Represents the final, generated audio deliverable for a Lead.

**Responsibilities** — References the accepted Lyrics and selected Mood used to generate it; references the stored audio file; tracks delivery status (emailed or not).

**Relationships** — Belongs to exactly one Lead. Generated from exactly one accepted Lyrics and one Mood. Only one Song exists per Lead.

## Lyrics

**Purpose** — Represents one generated lyrics version produced for a Lead's personalization input. Implemented as an aggregate root at `src/domain/lyrics/entities/Lyrics.ts`. This aggregate manages lyrics _versions_ only — it does not generate lyrics text itself; the actual generation (Claude) is a separate, not-yet-implemented concern that will call into this module with already-generated content.

**Responsibilities** — Holds the generated text, the prompt it was generated from, its mood, and whether it has been accepted, rejected, or is still pending. Enforces its own invariants rather than trusting callers to.

**Invariants** (enforced by the entity itself, not by infrastructure):

- `leadId`, `moodId`, `prompt`, and `content` are mandatory — construction fails otherwise.
- `version` must be a positive integer.
- A version cannot be approved twice (`approve()` throws if `approved` is already `true`).
- A rejected version can never be approved, and an approved version can never be rejected — `approved` and a set `rejectionReason` are mutually exclusive terminal outcomes for a given version.

**Lifecycle / Approval Process** — Each generation attempt for a Lead produces a new Lyrics version (a Lead may have multiple). A version starts pending (`approved: false`, `rejectionReason: null`) and ends in exactly one of two terminal states: **approved** (via `approve()` — the only version a Song may later be generated from) or **rejected** (via `reject(reason)` — e.g. moderation, or superseded by the user requesting a regeneration). "Only one Lyrics record can be marked as approved" is a _cross-record_ rule the entity cannot enforce alone (it would need to know about its siblings); that check belongs to `ApproveLyricsUseCase`, backstopped by a database constraint (see `docs/Architecture/Database_Model.md`) as the final guarantee.

**Relationships** — Belongs to one Lead (a Lead may have many Lyrics — one per generation attempt). Produced within the context of one GenerationAttempt (not yet implemented). References one Mood. At most one Lyrics per Lead is ever approved; that approved Lyrics is the only one a Song may later be generated from — enforcing that link is the future Song module's responsibility, not this one's. The persistence contract for this aggregate is `LyricsRepository` (`src/domain/lyrics/repositories/LyricsRepository.ts`) — interface only, no implementation yet.

## Application Layer — Lyrics

The Application layer (`src/application/lyrics/`) orchestrates the `Lyrics` aggregate. Like the Lead application layer, it depends only on the domain (entities, `LyricsRepository`) and never the other way around.

### GenerateLyricsUseCase

`src/application/lyrics/use-cases/GenerateLyricsUseCase.ts`. Given a `GenerateLyricsRequest` (`leadId`, `moodId`, `prompt`, already-generated `content`):

1. Looks up how many Lyrics versions already exist for the lead (`LyricsRepository.findAllByLead`) and derives the next `version` number — version numbering is bookkeeping the use case owns, not something the caller has to track.
2. Builds a new `Lyrics` via `Lyrics.create` and persists it via `LyricsRepository.create`.
3. Returns a `GenerateLyricsResponse` wrapping the persisted version's snapshot.

### ApproveLyricsUseCase

`src/application/lyrics/use-cases/ApproveLyricsUseCase.ts`. Given an `ApproveLyricsRequest` (`lyricsId`):

1. Looks up the Lyrics by id (`LyricsRepository.findById`); rejects with a business-rule error if not found.
2. Checks whether the lead already has a different approved version (`LyricsRepository.findApprovedByLead`) — this is the application-level enforcement point for "only one Lyrics record can be approved per lead," since the entity itself has no visibility into its siblings.
3. Calls `lyrics.approve()` (the entity's own "cannot be approved twice" / "cannot approve a rejected version" invariants apply here too).
4. Persists via `LyricsRepository.approve` and returns an `ApproveLyricsResponse`.

No Claude client, moderation, Prisma/Supabase repository, API route, or UI exists yet — `LyricsRepository` remains an interface, satisfied only by test doubles until the Infrastructure layer implements it.

## Campaign

**Purpose** — Represents the overall one-month marketing campaign and its global constraints.

**Responsibilities** — Defines the campaign's active window (start/end date) and the overall song cap (up to 3,000).

**Relationships** — One Campaign has many Leads. Leads cannot be registered outside the Campaign's active window or once its song cap is reached.

## Mood

**Purpose** — Represents one of the four predefined moods a user can select for their song.

**Responsibilities** — Maps to a fixed Suno prompt used during song generation; is a fixed, small reference set (not user-editable).

**Relationships** — Selected once per Lead's personalization. Used as an input to Song generation alongside the accepted Lyrics.

## GenerationAttempt

**Purpose** — Represents a single attempt at producing lyrics for a Lead, tracking consumption of the five-attempt budget.

**Responsibilities** — Records whether the attempt was consumed due to moderation rejection or user-requested regeneration, per the rules in `docs/Product/Business_Rules.md`. Never created/consumed for audio (Song) generation.

**Relationships** — Belongs to one Lead. A Lead has up to five GenerationAttempts. Each GenerationAttempt may be associated with one Lyrics record (the output of that attempt, if generation succeeded).

## Admin

**Purpose** — Represents the campaign administrator who monitors submissions and exports data.

**Responsibilities** — Views Leads, Lyrics, and Songs across the Campaign; triggers CSV export. Version 1 supports a single Admin (see `BACKLOG_V2.md` for multiple administrators).

**Relationships** — Not tied to a specific Lead; operates across the whole Campaign.
