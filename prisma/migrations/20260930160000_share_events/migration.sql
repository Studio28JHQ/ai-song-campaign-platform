-- Share Tracking — records a click on a share link in the "song ready" email.
--
-- Strictly additive: one new enum, one new table, three new indexes and
-- two foreign keys. No existing column is altered, no existing row is
-- read or written, and there is no backfill — historical shares were
-- never observable and are not invented here.

CREATE TYPE "share_platform" AS ENUM ('WHATSAPP', 'FACEBOOK', 'X');

CREATE TABLE "share_events" (
    "id"          UUID NOT NULL,
    "songId"      UUID NOT NULL,
    "leadId"      UUID NOT NULL,
    "platform"    "share_platform" NOT NULL,
    "utmSource"   TEXT,
    "utmMedium"   TEXT,
    "utmCampaign" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_events_pkey" PRIMARY KEY ("id")
);

-- Daily totals for the dashboard.
CREATE INDEX "share_events_createdAt_idx" ON "share_events" ("createdAt");
-- Per-platform breakdown over a date window.
CREATE INDEX "share_events_platform_createdAt_idx" ON "share_events" ("platform", "createdAt");
-- One family's history, newest first.
CREATE INDEX "share_events_leadId_createdAt_idx" ON "share_events" ("leadId", "createdAt");

-- Cascade on both sides: a deleted family takes its share history with
-- it, the same way it already takes its lyrics, attempts and song
-- (see `DeleteLeadUseCase`), so no orphan row can outlive the data it
-- describes.
ALTER TABLE "share_events"
  ADD CONSTRAINT "share_events_songId_fkey"
  FOREIGN KEY ("songId") REFERENCES "songs" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "share_events"
  ADD CONSTRAINT "share_events_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
