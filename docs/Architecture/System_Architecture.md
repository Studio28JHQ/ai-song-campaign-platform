# System Architecture

## High-Level Architecture

The system is a modular monolith built on Next.js, following Clean Architecture and lightweight Domain Driven Design. All code runs as a single deployable application (Vercel), with clearly separated layers inside the codebase rather than separate services or processes.

## Application Layers

- **Domain** — Core business concepts and rules: leads, emails, attempts, moods, lyrics, songs. No framework or infrastructure dependencies.
- **Application** — Use cases / orchestration (e.g. register lead, generate lyrics, accept lyrics, generate song, deliver email). Depends only on the domain layer and repository/service interfaces.
- **Infrastructure** — Implementations of repositories and external service adapters (Prisma/Supabase persistence, Claude client, Suno client, Resend client, Supabase Storage client).
- **Presentation** — Next.js Route Handlers and UI (React components, pages) that call into the application layer.

Dependencies point inward: presentation and infrastructure depend on application and domain; domain depends on nothing else.

## External Services

- **Anthropic Claude API** — content moderation and lyrics generation.
- **Suno API** — final song (audio) generation.
- **Supabase** — primary database (via Prisma) and Supabase Storage for audio files.
- **Resend** — transactional email delivery of the final song.
- **Vercel** — hosting and deployment.
- **Cloudflare** — DNS/CDN/edge in front of the deployed application.

## Main Request Flow

1. User submits registration + personalization via a Next.js Route Handler.
2. Application layer checks email uniqueness and remaining attempts (domain rules).
3. Application layer calls Claude for moderation; on rejection, an attempt is consumed and the flow returns an error to the user.
4. On approval, application layer calls Claude to generate lyrics and returns a preview to the user.
5. User accepts or requests regeneration (consuming an attempt) via another Route Handler call.
6. On acceptance, application layer calls Suno to generate the song (no attempt consumed).
7. Generated audio is stored in Supabase Storage.
8. Application layer triggers Resend to email the final song to the user.
9. Lead/campaign state is persisted throughout via the Repository Pattern over Prisma/Supabase.

## Data Flow

Lead and personalization data, attempt counts, moderation results, lyrics versions, and final song references are persisted in the database via repositories. Audio binaries are stored in Supabase Storage, referenced by URL/key from the database record. The admin panel reads this same persisted data to display submissions and produce CSV exports.

## Deployment Architecture

The Next.js application is deployed as a single unit to Vercel, sitting behind Cloudflare. Supabase hosts the database and object storage. There is no separate backend service, queue, or worker fleet — all orchestration (moderation → lyrics → song → email) happens within the same application via Route Handlers and application-layer use cases.

## Technology Decisions

See `PROJECT_MANIFEST.md` for the full stack. Key decisions:

- **Next.js Route Handlers** instead of a separate API service — keeps the monolith cohesive and avoids operating a second deployable.
- **Prisma + Supabase** for a single, managed relational data store — no need for polyglot persistence at this scale.
- **Repository Pattern + Dependency Injection** to keep domain/application code decoupled from Prisma/Supabase specifics, without introducing a heavier framework.

## Lead Persistence Flow

The first concrete Repository Pattern implementation lives at `src/infrastructure/persistence/prisma/lead/`:

- **`PrismaLeadRepository`** implements the domain's `LeadRepository` interface (`src/domain/lead/repositories/LeadRepository.ts`) — the application layer depends only on that interface and is unaware a Prisma implementation exists.
- **`LeadMapper`** translates between the Prisma `Lead` model and the `Lead` domain entity in both directions. No Prisma type is ever returned from the repository — every method returns a domain `Lead` (or `null`/`boolean`). Because the persistence-layer `LeadStatus` enum is more granular than the domain's (it also encodes lyrics/song sub-states that don't have their own aggregates yet), the mapper collapses every "in progress" persistence value to the domain's single `GENERATING` status on read, and rejects writing the domain's `FAILED` status outright rather than silently mis-storing it as a different persistence value — see the mapper's source comments and `docs/Architecture/Domain_Model.md`.
- **`src/infrastructure/persistence/prisma/client.ts`** holds a single, `globalThis`-cached `PrismaClient`, constructed with the `@prisma/adapter-pg` driver adapter (required by the generated client in this Prisma version) using `appConfig.database.url` — never a direct `process.env` read.
- Prisma exceptions (`PrismaClientKnownRequestError`, etc.) are caught inside the repository and re-thrown as the shared error types from `src/shared/errors` (a unique-constraint violation on email becomes a `BusinessRuleError`; everything else becomes a `DatabaseError`). No Prisma-specific exception crosses the repository boundary.

## Why This Project Intentionally Avoids

- **Microservices** — the campaign has a fixed, modest scale (≤3,000 songs, one month). Splitting into services would add deployment, networking, and operational overhead with no corresponding benefit.
- **Event-driven architecture** — the business flow is a linear, synchronous-enough pipeline (moderate → generate lyrics → accept → generate song → email). Introducing queues/event buses would add infrastructure and failure modes disproportionate to the task.
- **Multiple AI providers** — Claude and Suno are each used for a single, well-defined responsibility (moderation/lyrics, and song generation, respectively). Supporting alternate providers would add abstraction and testing surface for a temporary campaign that will not be maintained long-term.
- **Unnecessary abstractions** — the codebase favors direct, evolvable implementations over speculative interfaces or plugin systems, since the system has one deployment target, one campaign, and a known, bounded lifetime.
