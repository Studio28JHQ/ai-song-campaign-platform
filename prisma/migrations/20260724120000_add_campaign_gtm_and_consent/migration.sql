-- Feature 1 — Google Tag Manager Configuration. A single, DB-backed
-- global setting on the existing Campaign row (this app has exactly one
-- campaign) rather than a new table — see docs/Architecture/Domain_Model.md
-- (Campaign is the project's existing "global constraints" concept).
-- Nullable: empty means GTM is disabled and no tracking code is rendered.

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "gtmContainerId" TEXT;

-- Feature 2 — Privacy Consent Module. One anonymous Consent record per
-- first-party session, optionally associated with a Lead once one is
-- created (never a second Consent row for the same session).

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "sessionId" TEXT NOT NULL,
    "leadId" UUID,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consents_sessionId_key" ON "consents"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "consents_leadId_key" ON "consents"("leadId");

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
