-- Social Sharing — public share token for a song.
--
-- Adds the opaque token behind `/song/share/[shareToken]`. Additive and
-- reversible: one nullable column plus its unique index. No column is
-- dropped, no row is deleted, and nothing outside `songs` is touched.
--
-- `NULL` means "this song has no public page" — it has not completed, it
-- predates this column, or the link was revoked by clearing the token.

ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "publicShareToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "songs_publicShareToken_key"
  ON "songs" ("publicShareToken");

-- Backfill: every song that is already shareable gets a token, so the
-- ~512 families whose song completed before this existed can share it
-- too. 32 random bytes as hex, matching what `Song.markCompleted` mints
-- in application code — `gen_random_bytes` comes from pgcrypto, which
-- Supabase enables by default.
--
-- Scoped deliberately: COMPLETED only, and only with audio actually
-- stored. A queued, generating or failed song has nothing to play, so it
-- gets no token and its URL would 404 anyway.
UPDATE "songs"
   SET "publicShareToken" = encode(gen_random_bytes(32), 'hex')
 WHERE "publicShareToken" IS NULL
   AND "status" = 'COMPLETED'
   AND "audioStorageKey" IS NOT NULL;
