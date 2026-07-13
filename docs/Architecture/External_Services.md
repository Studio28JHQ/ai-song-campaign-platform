# External Services

This document describes every external integration used by the platform: purpose, expected inputs/outputs, failure scenarios, and retry policy.

## Claude API

**Responsibilities**

- Content moderation
- Lyrics generation

**Purpose** — Ensures personalization input is safe before generating creative content, and produces the personalized lyrics shown to the user. Implemented at `src/infrastructure/ai/claude/`.

**Single-Request Design** — Moderation and lyrics generation are **one Claude request**, not two. The prompt (built by `PromptBuilder`) asks Claude to moderate the parent's message against a fixed set of campaign/safety rules and, only if approved, generate the lyrics in the same response. This avoids a second round-trip (and a second cost/latency hit) for the common case where the input is safe.

**Classes:**

- **`ClaudeClient`** — minimal HTTP client for Anthropic's Messages API, built on the shared `httpRequest` helper (`src/shared/http/`) rather than the official SDK, consistent with the project's "no unnecessary abstractions" principle. Adds the `x-api-key` (from `appConfig.claude.apiKey`) and `anthropic-version` headers and posts the model/prompt.
- **`PromptBuilder`** — assembles the system prompt (fixed campaign rules, safety/moderation rules, writing instructions, and the required JSON response format) and the user message (baby name, parent message, selected mood, language). This is the only place those rules are defined.
- **`ResponseParser`** — extracts the text content block from Claude's response, parses it as JSON, and validates it against the expected shape with Zod, including the invariant that an approved result has non-empty lyrics and a rejected result has a non-empty reason.
- **`ClaudeLyricsService`** — orchestrates the three above: build prompt → send message → parse response. Not yet wired into any Application use case; that wiring is a future task.

**Request Flow:**

1. `ClaudeLyricsService.generateAndModerate(input)` calls `PromptBuilder.build` with the baby's name, the parent's message, the selected mood, and the language.
2. `ClaudeClient.sendMessage` posts the resulting system/user prompt to Anthropic's Messages API.
3. `ResponseParser.parse` extracts and validates the response.
4. The caller receives `{ approved, reason, lyrics }` — never a raw Claude payload.

**Response Format** — The prompt requires Claude to return a single JSON object and nothing else (no free text, no markdown fences):

```json
{ "approved": true, "reason": null, "lyrics": "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus" }
```

or

```json
{ "approved": false, "reason": "...moderation reason...", "lyrics": null }
```

When approved, the lyrics follow a fixed structure (Title, Verse 1, Chorus, Verse 2, Final Chorus) sized for roughly 2–3 minutes of music, as plain text.

**Failure Scenarios** — Network errors and timeouts are retried transparently by the shared `httpRequest` helper; once retries are exhausted, or on a non-ok HTTP status, an invalid response body, missing text content, invalid JSON, or a response that doesn't match the expected schema, `ClaudeClient`/`ResponseParser` throw the shared `ExternalApiError` (`src/shared/errors/`) — no raw Claude exception, payload, or stack trace ever escapes the infrastructure layer.

**Retry Policy** — Transient failures (timeout, connection errors, repeated 5xx) are retried a limited number of times with backoff by `httpRequest` (see `src/config/constants.ts`); a non-retryable failure (4xx, malformed JSON, schema mismatch) fails immediately rather than retrying, since retrying the same malformed request would not help. Whether a given failure consumes a lyric attempt is an Application-layer decision, not this layer's (see `docs/Development/Error_Handling.md`).

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
