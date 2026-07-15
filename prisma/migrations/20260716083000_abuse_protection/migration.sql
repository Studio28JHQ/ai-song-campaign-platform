-- Sprint 8.2 — Abuse Protection.
-- 1) `AuditLog.admin_id` becomes nullable: a NULL actor represents a
--    system-recorded security/abuse event (rate limit exceeded, invalid
--    Turnstile token, ...), not an admin action.
-- 2) `rate_limit_events` — a generic, DB-backed sliding-window counter.
--    No Redis/message queue — see PROJECT_MANIFEST.md.

ALTER TABLE "audit_logs" ALTER COLUMN "admin_id" DROP NOT NULL;

CREATE TABLE "rate_limit_events" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rate_limit_events_key_createdAt_idx" ON "rate_limit_events"("key", "createdAt");
