/**
 * Social Sharing — the public share page's one read port.
 *
 * Narrow on purpose, and narrow in the direction that matters: this is
 * the only query in the application that answers to an unauthenticated
 * caller holding nothing but a token, so it returns the smallest set of
 * fields a stranger may see and cannot be widened by accident. There is
 * no lead id, no parent name, no email, no phone, no lyrics, no prompt,
 * no provider, no status, no timestamp and no internal id in this view —
 * if a field is not here, the public page cannot leak it.
 *
 * A read gate rather than a repository for the same reason `CampaignGate`
 * is: there is no aggregate to load and nothing to write back.
 */
export interface PublicSongShareView {
  /** Shown as "una canción personalizada para X". The only personal datum on the page. */
  babyName: string;
  /** Seconds, for the "1:00" label. `null` when the provider never reported one. */
  duration: number | null;
  /**
   * The R2 object key — **server-side only**. The audio route resolves it
   * into a short-lived signed URL at play time; it is never rendered,
   * never serialized into the page, and never sent to the browser.
   */
  audioStorageKey: string;
}

export interface PublicSongShareGate {
  /**
   * Resolves a share token to the song behind it, or `null` when there
   * is nothing to show: no such token, the song never completed, its
   * audio is missing, or the token was cleared to revoke the link. Every
   * one of those answers `null` identically, so a caller probing tokens
   * learns nothing about which songs exist.
   */
  findShareableByToken(shareToken: string): Promise<PublicSongShareView | null>;
}
