-- Adds the dedicated, opaque, DB-backed session token for the
-- parent-facing flow (see docs/Architecture/System_Architecture.md —
-- Parent Session). A separate table rather than a column on "leads",
-- since a session is an auth concern, not a Lead attribute, and a lead
-- may accumulate more than one session over time (e.g. across devices).
CREATE TABLE "lead_sessions" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "leadId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lead_sessions_token_key" ON "lead_sessions"("token");

CREATE INDEX "lead_sessions_leadId_idx" ON "lead_sessions"("leadId");

ALTER TABLE "lead_sessions" ADD CONSTRAINT "lead_sessions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
