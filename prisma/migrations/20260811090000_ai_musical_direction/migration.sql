-- Sprint v1.1 — AI Musical Direction.
-- Claude now generates a creative musical interpretation (musicMood,
-- musicDirection) alongside the lyrics, in the same call. Both are
-- stored per Lyrics version so every regenerated version has its own
-- corresponding direction; the approved version's is what a Song is
-- later generated from. `parentMessage` is stored too, so the original
-- "Baby Context" is available at song-generation time without a lossy
-- round-trip through the existing `prompt` display string. `voice` is
-- the parent's requested narrator voice, selected on the same form.
--
-- The three text columns are nullable: pre-existing Lyrics rows
-- (created before this migration) have no musical direction and remain
-- valid rows — only newly created rows populate them (enforced by
-- `Lyrics.create`, not by a database constraint). `voice` defaults to
-- FEMALE, the form's own default, for the same reason.

-- CreateEnum
CREATE TYPE "voice" AS ENUM ('FEMALE', 'MALE');

-- AlterTable
ALTER TABLE "lyrics"
  ADD COLUMN "parentMessage" TEXT,
  ADD COLUMN "musicMood" TEXT,
  ADD COLUMN "musicDirection" TEXT,
  ADD COLUMN "voice" "voice" NOT NULL DEFAULT 'FEMALE';
