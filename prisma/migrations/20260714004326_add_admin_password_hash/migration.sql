-- Adds the password hash column required by the Administration module's
-- authentication (see docs/Architecture/System_Architecture.md). The
-- `admin_users` table has no creation flow (user management is out of
-- scope), so it is always empty at this point — a NOT NULL column can be
-- added directly, without a default or a backfill step.
ALTER TABLE "admin_users" ADD COLUMN "passwordHash" TEXT NOT NULL;
