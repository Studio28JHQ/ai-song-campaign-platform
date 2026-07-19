-- "Resume journey by email" — adds the stable, cryptographically random
-- token used by the emailed resume link (see `ResolveResumeTokenUseCase`).
-- The `leads` table already has live rows, so this cannot be a plain
-- `ADD COLUMN ... NOT NULL` (no single Prisma-expressible default can
-- produce a distinct random value per existing row) — instead: add
-- nullable, backfill every existing row with a random value, then enforce
-- NOT NULL/UNIQUE. The backfill uses Postgres's built-in gen_random_uuid()
-- (available natively since Postgres 13, no extension required) — two
-- concatenated UUIDs give the same 256-bit class of randomness as the
-- app's own token generation (`crypto.getRandomValues`, 32 bytes) that
-- every row created after this migration gets instead.

-- AlterTable
ALTER TABLE "leads" ADD COLUMN "resumeToken" TEXT;

-- Backfill
UPDATE "leads"
SET "resumeToken" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE "resumeToken" IS NULL;

-- AlterTable
ALTER TABLE "leads" ALTER COLUMN "resumeToken" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "leads_resumeToken_key" ON "leads"("resumeToken");
