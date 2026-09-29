-- Sprint FINAL-2 — Lyrics Generation Traceability.
--
-- Additive only. This migration adds one enum value and three nullable
-- columns to a table that has never been written to (zero rows), and it
-- touches no other table:
--
--   * no DROP, DELETE, UPDATE or TRUNCATE
--   * no backfill of any kind — historical leads keep having no attempt
--     rows, which is the truth: those generations were never recorded
--   * every new column is nullable with no default, so no existing row is
--     rewritten and no table rebuild is triggered
--
-- `ADD VALUE` on an enum is not transactional in PostgreSQL before 12;
-- on the campaign's Postgres (15+) it is, and Prisma runs each migration
-- in a transaction.

-- 'STARTED' is appended last on purpose: it is a pre-call marker, and
-- appending keeps the existing ordinals of SUCCESS / MODERATION_REJECTED
-- / FAILED untouched.
ALTER TYPE "generation_attempt_result" ADD VALUE IF NOT EXISTS 'STARTED';

ALTER TABLE "generation_attempts" ADD COLUMN "errorCode" TEXT;
ALTER TABLE "generation_attempts" ADD COLUMN "providerModel" TEXT;
ALTER TABLE "generation_attempts" ADD COLUMN "completedAt" TIMESTAMP(3);
