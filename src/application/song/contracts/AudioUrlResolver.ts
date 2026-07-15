/**
 * Resolves a persisted R2 object key into a URL a browser can actually
 * fetch — always generated fresh, on demand, never persisted (Sprint
 * 9.1: the database stores only `Song.audioStorageKey`; a signed URL and
 * a provider URL are both time-limited and must never become durable
 * domain data). Every place that needs to show or email the audio calls
 * this at the moment it's needed — `GenerationPoller` (the "song ready"
 * email), `GetLeadSessionStateUseCase` (the parent-facing session
 * endpoint), `GetLeadDetailUseCase` and `ResendSongEmailUseCase` (the
 * admin panel).
 *
 * Reserved future extension point: a `DownloadToken` abstraction (issuing
 * a short-lived, app-level token instead of handing out a raw R2-signed
 * URL — enabling one-time-use links, click analytics, or independent
 * expiry policy) would replace this interface's single implementation
 * without changing any of the call sites above. Not implemented in
 * Sprint 9.1 — this interface is the seam it will plug into.
 */
export interface AudioUrlResolver {
  resolve(storageKey: string): Promise<string>;
}
