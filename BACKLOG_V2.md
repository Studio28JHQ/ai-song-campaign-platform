# Backlog V2 — Future Enhancements

This backlog captures features explicitly out of scope for Version 1. None of these should be implemented until a future version is planned. See `PROJECT_MANIFEST.md` for current scope boundaries.

## CRM Integration

Sync leads and campaign activity with a CRM system.

## Advanced Analytics

Deeper campaign analytics beyond basic admin reporting.

## Social Sharing

**Implemented.** The "song ready" email's WhatsApp, Facebook and X buttons share the song's own public page, `/song/share/[shareToken]`, which shows the baby's first name, a player and a "crea tu propia canción" CTA, and carries per-song Open Graph tags so the link previews with the campaign banner.

What remains in V2 is everything beyond that first step: in-app sharing from `/song` rather than only from the email, a share count or any analytics on it, per-song Open Graph images rendered with the child's name, and an admin screen to revoke a share link. Revocation itself is already possible — clearing `songs.publicShareToken` kills the public page and nothing else — but there is no UI for it.

## Voice Cloning

Personalize songs further using voice cloning technology.

## Additional Music Moods

Expand beyond the four predefined Version 1 moods.

## Extended Personalization

Additional personalization fields/options beyond Version 1 inputs.

## Multiple Administrators

Support multiple admin accounts with roles/permissions.

## Multiple Songs Per User

Allow a single user/email to generate more than one final song.

## HubSpot Integration

Integrate lead capture and campaign data with HubSpot.

## Mailchimp Integration

Integrate email delivery/marketing with Mailchimp.

## Mureka `reference_id` Support

Let a song generation reference a prior Mureka job (e.g. for variation/remix workflows). Deliberately out of scope for the current one-song-per-user, generate-from-lyrics-only flow.

## Mureka `vocal_id` Support

Support Mureka's vocal-cloning parameter. Out of scope for V1 — the campaign only offers the two fixed `gender` options.

## Mureka `melody_id` Support

Support Mureka's melody-guide parameter (generating a song around an existing melody). Out of scope for V1 — every song is generated from lyrics and creative direction only, never a reference melody.
