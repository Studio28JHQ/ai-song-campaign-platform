-- Sprint 7.5 — renames the Song generation states to the queue-based
-- vocabulary (QUEUED/GENERATING/COMPLETED/FAILED). This is a database
-- state machine + sequential processing, not an event-driven/queue
-- broker system — see PROJECT_MANIFEST.md's Architecture exception.
ALTER TYPE "song_status" RENAME VALUE 'PENDING' TO 'QUEUED';
ALTER TYPE "song_status" RENAME VALUE 'READY' TO 'COMPLETED';

ALTER TABLE "songs" ALTER COLUMN "status" SET DEFAULT 'QUEUED';
