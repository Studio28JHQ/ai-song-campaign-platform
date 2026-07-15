-- Sprint 8.2 — Abuse Protection.
-- 1) `AuditLog.adminId` becomes nullable: a NULL actor represents a
--    system-recorded security/abuse event (rate limit exceeded, invalid
--    Turnstile token, ...), not an admin action.
-- 2) `rate_limit_events` — a generic, DB-backed sliding-window counter.
--    No Redis/message queue — see PROJECT_MANIFEST.md.
--
-- HOTFIX-DB-3: this file originally referenced the column as "admin_id"
-- (snake_case). The column the `init` migration actually created — and
-- the one `schema.prisma`'s `AuditLog.adminId` field (no `@map`) still
-- expects — is "adminId" (camelCase), matching every other
-- Prisma-managed column in this schema. The snake_case spelling never
-- matched any real column, so this migration has never successfully
-- applied against any correctly-initialized database; see
-- docs/Development/Environment.md for the full incident writeup.

ALTER TABLE "audit_logs" ALTER COLUMN "adminId" DROP NOT NULL;

CREATE TABLE "rate_limit_events" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rate_limit_events_key_createdAt_idx" ON "rate_limit_events"("key", "createdAt");
