# External Services

This document describes every external integration used by the platform: purpose, expected inputs/outputs, failure scenarios, and retry policy.

## Claude API

**Responsibilities**

- Content moderation
- Lyrics generation

**Purpose** — Ensures personalization input is safe before generating creative content, and produces the personalized lyrics shown to the user.

**Expected Inputs** — Personalization input (e.g. baby's name, selected mood, any free-text detail) for moderation; validated, moderated input plus mood context for lyrics generation.

**Expected Outputs** — A moderation verdict (approved/rejected, with reason where applicable) for moderation calls; generated lyrics text for lyrics generation calls.

**Failure Scenarios** — Request timeout, rate limiting, malformed/empty response, service outage.

**Retry Policy** — Retry transient failures (timeout, rate limit) a limited number of times with backoff; on persistent failure, surface a user-friendly error without consuming a lyric attempt (see `docs/Development/Error_Handling.md`).

## Suno API

**Responsibilities**

- Audio generation

**Purpose** — Generates the final song audio from the accepted lyrics and the fixed prompt for the selected Mood.

**Expected Inputs** — Accepted Lyrics text and the Mood's fixed Suno prompt.

**Expected Outputs** — Generated audio file (or a reference/URL to retrieve it).

**Failure Scenarios** — Request timeout, rate limiting, generation failure, service outage.

**Retry Policy** — Retry transient failures with backoff; on persistent failure, surface a user-friendly error. Song generation failures never consume a lyric attempt.

## Supabase

**Responsibilities**

- PostgreSQL
- Storage
- Authentication

**Purpose** — Primary relational database (via Prisma) for all domain records (Lead, Lyrics, Song, Campaign, Mood, GenerationAttempt); object storage for generated audio files; authentication for the Admin panel.

**Expected Inputs** — Reads/writes from repository implementations; audio file uploads; admin login credentials.

**Expected Outputs** — Persisted/retrieved domain records; stored file URLs; authenticated admin sessions.

**Failure Scenarios** — Connection failure, constraint violation, storage upload failure, authentication failure.

**Retry Policy** — Retry transient connection/upload failures a limited number of times; constraint violations (e.g. duplicate email) are not retried — they are translated into the corresponding business error.

## Resend

**Responsibilities**

- Transactional emails

**Purpose** — Delivers the final song email to the user once generated and stored.

**Expected Inputs** — Recipient email, final Song reference/audio link, email template content.

**Expected Outputs** — Delivery confirmation/status.

**Failure Scenarios** — Delivery failure, invalid recipient, service outage.

**Retry Policy** — Retry transient delivery failures with backoff; on persistent failure, log for admin follow-up rather than blocking the user-facing flow indefinitely.

## Vercel

**Responsibilities**

- Hosting

**Purpose** — Hosts and deploys the single Next.js application.

**Expected Inputs** — Application build/deployment.

**Expected Outputs** — Publicly reachable, deployed application.

**Failure Scenarios** — Build failure, deployment failure, platform outage.

**Retry Policy** — Deployment failures are addressed by fixing the underlying build/config issue and redeploying; no automatic retry of a broken build.

## Cloudflare

**Responsibilities**

- DNS

**Purpose** — Resolves the campaign domain to the Vercel-hosted application.

**Expected Inputs** — DNS configuration for the campaign domain.

**Expected Outputs** — Correct domain resolution to the application.

**Failure Scenarios** — Misconfiguration, propagation delay, outage.

**Retry Policy** — Not applicable at the application level; DNS issues are resolved via configuration correction.
