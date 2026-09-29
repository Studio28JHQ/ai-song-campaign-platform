# Backlog V3 — Optimization Backlog

This backlog captures optimization work explicitly out of scope for Version 1. None of these should be implemented until a future version is planned. See `PROJECT_MANIFEST.md` for current scope boundaries.

## AI Cost Optimization

Reduce cost per generated lyric/song across AI provider usage.

## Prompt Optimization

Refine and tune prompts for quality and consistency at scale.

## Caching Strategy

Introduce caching where it measurably reduces cost or latency.

## UX Improvements

Iterate on the user experience based on campaign data and feedback.

## Performance Optimization

Improve response times and throughput under real campaign load.

## Advanced Observability

Add deeper logging, tracing, and monitoring beyond Version 1 baseline.

## Generation Attempt Audit Trail

**Implemented** in Sprint FINAL-2 — Lyrics Generation Traceability: `GenerationAttempt` now holds one row per real Claude call, surfaced on the Admin lead-detail screen (see `docs/Architecture/Database_Model.md#GenerationAttempt`). The attempts business rule is still enforced via `Lead.remainingAttempts` alone; the table is observability, not a rule.

Two deliberately unimplemented remainders, neither of which is needed to answer "what happened to this family":

- **Attempts as timeline events.** The recorded calls are shown as their own section, not merged into the newest-first execution history. Merging them would mean deciding how a failed provider call reads next to "Letra generada" for a non-technical operator — a presentation question, not a data one.
- **Linking an attempt to the `Lyrics` row it produced** (`generation_attempts.lyricsId`, present and always `null`). It would require the use case to write back to the attempt after persistence, coupling the generation flow to the audit trail for information the attempt's own outcome already conveys.

## Expand End-to-End Test Coverage

The current Playwright suite is a single landing-page smoke test. Expanding it to cover the full registration → lyrics → song → email journey would require mocking the Claude/Mureka/Resend provider boundaries at the network level — worth doing once a dedicated E2E test environment/strategy is planned.

## Evaluate Additional Mureka Parameters

Mureka's `POST /v1/song/generate` contract may document further optional parameters beyond `lyrics`/`prompt`/`model`/`n`/`gender`/`stream` — worth a deliberate review once the current contract has run in production for a while, rather than speculatively adding fields now.

## Improve Mureka Adapter Typing

`src/infrastructure/mureka/` currently types the submission/poll responses only as narrowly as `ResponseParser`'s Zod schemas require. A stronger, fuller typing of Mureka's documented response shapes (beyond the fields this integration actually reads) could make future field additions safer.
