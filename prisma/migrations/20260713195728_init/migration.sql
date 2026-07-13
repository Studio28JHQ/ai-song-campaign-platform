-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "campaign_status" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('REGISTERED', 'MODERATION_REJECTED', 'LYRICS_GENERATED', 'LYRICS_APPROVED', 'SONG_GENERATING', 'SONG_READY', 'COMPLETED', 'ATTEMPTS_EXHAUSTED');

-- CreateEnum
CREATE TYPE "generation_attempt_result" AS ENUM ('SUCCESS', 'MODERATION_REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "song_status" AS ENUM ('PENDING', 'GENERATING', 'READY', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "campaign_status" NOT NULL DEFAULT 'DRAFT',
    "maximumSongs" INTEGER NOT NULL,
    "songsGenerated" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isGenerationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "parentName" TEXT NOT NULL,
    "babyName" TEXT NOT NULL,
    "babyAge" INTEGER,
    "city" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "remainingAttempts" INTEGER NOT NULL DEFAULT 5,
    "status" "lead_status" NOT NULL DEFAULT 'REGISTERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moods" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sunoPrompt" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lyrics" (
    "id" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "moodId" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "rejectionReason" TEXT,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lyrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_attempts" (
    "id" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "lyricsId" UUID,
    "attemptNumber" INTEGER NOT NULL,
    "result" "generation_attempt_result" NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "songs" (
    "id" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "lyricsId" UUID NOT NULL,
    "moodId" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'suno',
    "providerSongId" TEXT,
    "audioUrl" TEXT,
    "duration" INTEGER,
    "status" "song_status" NOT NULL DEFAULT 'PENDING',
    "generatedAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "songs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE UNIQUE INDEX "leads_email_key" ON "leads"("email");

-- CreateIndex
CREATE INDEX "leads_campaignId_idx" ON "leads"("campaignId");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_createdAt_idx" ON "leads"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "moods_name_key" ON "moods"("name");

-- CreateIndex
CREATE INDEX "moods_active_idx" ON "moods"("active");

-- CreateIndex
CREATE INDEX "lyrics_leadId_idx" ON "lyrics"("leadId");

-- CreateIndex
CREATE INDEX "lyrics_approved_idx" ON "lyrics"("approved");

-- CreateIndex
CREATE UNIQUE INDEX "lyrics_leadId_version_key" ON "lyrics"("leadId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "generation_attempts_lyricsId_key" ON "generation_attempts"("lyricsId");

-- CreateIndex
CREATE INDEX "generation_attempts_leadId_idx" ON "generation_attempts"("leadId");

-- CreateIndex
CREATE INDEX "generation_attempts_result_idx" ON "generation_attempts"("result");

-- CreateIndex
CREATE INDEX "generation_attempts_createdAt_idx" ON "generation_attempts"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "generation_attempts_leadId_attemptNumber_key" ON "generation_attempts"("leadId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "songs_leadId_key" ON "songs"("leadId");

-- CreateIndex
CREATE INDEX "songs_status_idx" ON "songs"("status");

-- CreateIndex
CREATE INDEX "songs_createdAt_idx" ON "songs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "audit_logs_adminId_idx" ON "audit_logs"("adminId");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lyrics" ADD CONSTRAINT "lyrics_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lyrics" ADD CONSTRAINT "lyrics_moodId_fkey" FOREIGN KEY ("moodId") REFERENCES "moods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_lyricsId_fkey" FOREIGN KEY ("lyricsId") REFERENCES "lyrics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "songs" ADD CONSTRAINT "songs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "songs" ADD CONSTRAINT "songs_lyricsId_fkey" FOREIGN KEY ("lyricsId") REFERENCES "lyrics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "songs" ADD CONSTRAINT "songs_moodId_fkey" FOREIGN KEY ("moodId") REFERENCES "moods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-added constraints: Prisma's schema DSL cannot express CHECK
-- constraints or partial unique indexes, so these are maintained directly
-- in migration SQL. See docs/Architecture/Database_Model.md ("Constraints").

-- CheckConstraint: a lead's remaining lyric attempts can never go negative.
ALTER TABLE "leads" ADD CONSTRAINT "leads_remaining_attempts_non_negative" CHECK ("remainingAttempts" >= 0);

-- PartialUniqueIndex: at most one approved lyrics version per lead.
CREATE UNIQUE INDEX "lyrics_one_approved_per_lead" ON "lyrics"("leadId") WHERE "approved" = true;

