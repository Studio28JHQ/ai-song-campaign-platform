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

## Song

**Purpose** — Represents the final, generated audio deliverable for a Lead.

**Responsibilities** — References the accepted Lyrics and selected Mood used to generate it; references the stored audio file; tracks delivery status (emailed or not).

**Relationships** — Belongs to exactly one Lead. Generated from exactly one accepted Lyrics and one Mood. Only one Song exists per Lead.

## Lyrics

**Purpose** — Represents a generated set of lyrics produced for a Lead's personalization input.

**Responsibilities** — Holds the generated text, its moderation outcome, and whether it was accepted, rejected, or superseded by a regeneration.

**Relationships** — Belongs to one Lead. Produced within the context of one GenerationAttempt. At most one Lyrics per Lead is ever "accepted"; that accepted Lyrics is what a Song is generated from.

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
