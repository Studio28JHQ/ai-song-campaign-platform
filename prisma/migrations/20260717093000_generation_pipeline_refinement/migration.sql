-- Sprint 9.1 — Generation Pipeline Refinement.
-- Splits provider interaction into a submit phase (GenerationDispatcher)
-- and a poll phase (GenerationPoller). Adds the provider metadata needed
-- to resume tracking a song across separate invocations, and replaces
-- `audio_url` with `audio_storage_key` — from this point forward the
-- database persists only a Cloudflare R2 object key, never a signed URL
-- and never a provider URL. Every consumer resolves a fresh signed URL
-- at read time via the existing storage abstraction (see
-- `AudioUrlResolver`).

ALTER TABLE "songs" RENAME COLUMN "audioUrl" TO "audioStorageKey";

ALTER TABLE "songs"
  ADD COLUMN "providerTaskId" TEXT,
  ADD COLUMN "providerTraceId" TEXT,
  ADD COLUMN "providerStatus" TEXT,
  ADD COLUMN "providerError" TEXT,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE INDEX "songs_providerTaskId_idx" ON "songs"("providerTaskId");
