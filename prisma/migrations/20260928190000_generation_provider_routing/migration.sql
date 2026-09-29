-- Generation provider routing (Mureka primary, Lyria fallback).
--
-- Additive only: no existing row is read, rewritten, or deleted. Every
-- historical `songs` row keeps the `provider` value it already has, so
-- `GenerationPoller` keeps resolving those songs to the same provider
-- adapter that generated them.
--
-- The `campaigns` defaults intentionally reproduce today's production
-- behaviour: Mureka stays the primary provider after this migration is
-- applied, and Lyria is only ever reached through the explicit fallback
-- whitelist until an admin changes the routing from the panel.

-- Campaign-level routing configuration (the campaign row is this
-- application's single global settings record — see DEFAULT_CAMPAIGN_ID).
ALTER TABLE "campaigns" ADD COLUMN "primaryProvider" TEXT NOT NULL DEFAULT 'mureka';
ALTER TABLE "campaigns" ADD COLUMN "fallbackProvider" TEXT DEFAULT 'lyria';

-- The provider model actually used for a generation ("mureka-9",
-- "lyria-3.5"). Nullable, so existing rows stay valid without a backfill.
ALTER TABLE "songs" ADD COLUMN "providerModel" TEXT;

-- The old default dated back to the Suno integration that was replaced
-- before beta. It only ever affected rows inserted without an explicit
-- provider, which the application never does. Changing the default does
-- not touch any existing row.
ALTER TABLE "songs" ALTER COLUMN "provider" SET DEFAULT 'mureka';
