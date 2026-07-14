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

The `GenerationAttempt` table is defined in the schema but not populated — the five-attempts business rule is enforced via `Lead.remainingAttempts` alone, which is sufficient for V1. Wiring up a real per-attempt audit trail would let the Admin execution history show individual moderation-rejected attempts that never produced a `Lyrics` row.

## Expand End-to-End Test Coverage

The current Playwright suite is a single landing-page smoke test. Expanding it to cover the full registration → lyrics → song → email journey would require mocking the Claude/Suno/Resend provider boundaries at the network level — worth doing once a dedicated E2E test environment/strategy is planned.
