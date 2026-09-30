import { BusinessRuleError, ValidationError } from "@/shared/errors";
import {
  SongStatus,
  type CreateSongInput,
  type SongGenerationDetails,
  type SongProps,
  type SongSnapshot,
  type SongSubmissionDetails,
} from "../types";

/** Mureka is the active music provider for every newly created Song — see PROJECT_MANIFEST.md. */
/**
 * The provider a Song is created with, before any dispatcher run has
 * decided which provider will actually generate it. Kept as a concrete
 * value (not `null`) so the column stays non-nullable and a `QUEUED`
 * song always reads as something; the authoritative value is written by
 * `assignProvider()` at submission time, which is the only value
 * `GenerationPoller` ever trusts.
 */
const DEFAULT_PROVIDER = "mureka";

/** 256 bits, the same bar `Lead`'s resume token and the session token use. */
const PUBLIC_SHARE_TOKEN_BYTE_LENGTH = 32;

/**
 * The opaque token that identifies this song on its public share page.
 *
 * Deliberately its own random value and not the song id: the id is
 * already handed to the parent's own browser by `GET /api/song/[songId]`,
 * and a public link has to stay revocable without disturbing anything
 * that references the song internally — clearing this column kills the
 * public page and nothing else. It is never derived from the id, the
 * lead, the baby's name, the email or a timestamp, so possessing one
 * reveals nothing and guessing another is a 256-bit search.
 *
 * Uses the platform's Web Crypto API, the same generator and the same
 * hex encoding as `Lead`'s resume token, so this file needs no
 * Node-specific import.
 */
function generatePublicShareToken(): string {
  const bytes = new Uint8Array(PUBLIC_SHARE_TOKEN_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * `FAILED -> GENERATING` is allowed so a transient provider failure can be
 * retried against the *same* row: `Song.leadId` is unique at the database
 * level (see docs/Architecture/Database_Model.md), so a failed attempt
 * must not permanently occupy a lead's one-song slot. Only a `COMPLETED`
 * song counts as the lead's "final song" — see docs/Product/Business_Rules.md.
 *
 * `FAILED -> QUEUED` is the one additional transition, used exclusively
 * by a manual admin retry (see `retryFromFailure`): it resets the row to
 * the same starting state a brand-new Song is created in, so the
 * existing dispatcher (`GenerationDispatcher`) picks it up identically either
 * way — see docs/Architecture/System_Architecture.md — Operational
 * Recovery.
 */
const ALLOWED_TRANSITIONS: Record<SongStatus, ReadonlyArray<SongStatus>> = {
  [SongStatus.QUEUED]: [SongStatus.GENERATING],
  [SongStatus.GENERATING]: [SongStatus.COMPLETED, SongStatus.FAILED],
  [SongStatus.FAILED]: [SongStatus.QUEUED, SongStatus.GENERATING],
  [SongStatus.COMPLETED]: [],
};

/**
 * Aggregate root for the one final song a Lead may generate, from an
 * already-approved Lyrics version. No persistence, no framework
 * dependency, and — per this module's scope — no provider call: this
 * entity only tracks state, it never talks to Mureka itself.
 */
export class Song {
  private constructor(private props: SongProps) {}

  static create(input: CreateSongInput): Song {
    const leadId = Song.requireNonEmpty(input.leadId, "leadId");
    const lyricsId = Song.requireNonEmpty(input.lyricsId, "lyricsId");
    const moodId = Song.requireNonEmpty(input.moodId, "moodId");
    const now = new Date();

    return new Song({
      id: crypto.randomUUID(),
      leadId,
      lyricsId,
      moodId,
      provider: DEFAULT_PROVIDER,
      providerModel: null,
      providerSongId: null,
      providerTaskId: null,
      providerTraceId: null,
      providerStatus: null,
      providerError: null,
      audioStorageKey: null,
      duration: null,
      // Minted on completion, not here: a song with no audio has nothing
      // to share, and handing out a token before there is a page behind
      // it would only create a link that 404s.
      publicShareToken: null,
      status: SongStatus.QUEUED,
      submittedAt: null,
      generatedAt: null,
      completedAt: null,
      emailedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Rehydrates a Song from already-persisted state (used by a future repository implementation). */
  static fromPersistence(props: SongProps): Song {
    return new Song({ ...props });
  }

  private static requireNonEmpty(value: string, field: string): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new ValidationError(`${field} is required.`, {
        code: `song.${field}_required`,
      });
    }
    return trimmed;
  }

  private assertCanTransitionTo(next: SongStatus): void {
    const allowed = ALLOWED_TRANSITIONS[this.props.status];
    if (!allowed.includes(next)) {
      throw new BusinessRuleError(`Song cannot transition from ${this.props.status} to ${next}.`, {
        code: "song.invalid_status_transition",
        context: { from: this.props.status, to: next },
      });
    }
  }

  private transitionTo(next: SongStatus): void {
    this.assertCanTransitionTo(next);
    this.props.status = next;
    this.props.updatedAt = new Date();
  }

  /** Moves the song into the active generation call. Valid from `QUEUED` or, on retry, `FAILED`. */
  markGenerating(): void {
    this.transitionTo(SongStatus.GENERATING);
  }

  /**
   * Records that `GenerationDispatcher` successfully submitted this job
   * to the provider (Sprint 9.1). Does not itself transition status —
   * the caller must already have called `markGenerating()` before
   * submitting, so a concurrent dispatch is blocked for the full
   * duration of the outbound call, not just after it returns. Valid
   * only while `GENERATING`.
   */
  /**
   * Records which provider (and which of its models) this generation is
   * actually being sent to. Called by `GenerationDispatcher` immediately
   * before submitting, and again if the whitelisted fallback takes over,
   * so the persisted value always names the provider that really ran —
   * never the campaign's currently configured primary. This is the value
   * `GenerationPoller` resolves its adapter from, which is what keeps an
   * in-flight song bound to its own provider when an admin changes the
   * routing mid-generation.
   */
  assignProvider(provider: string, providerModel: string): void {
    if (this.props.status !== SongStatus.GENERATING) {
      throw new BusinessRuleError("A provider can only be assigned while generating.", {
        code: "song.provider_assignment_invalid_state",
        context: { songId: this.props.id, status: this.props.status },
      });
    }

    this.props.provider = Song.requireNonEmpty(provider, "provider");
    this.props.providerModel = Song.requireNonEmpty(providerModel, "providerModel");
    this.props.updatedAt = new Date();
  }

  /**
   * The synchronous counterpart of `recordSubmission`, for a provider
   * that returns the finished audio in the same call instead of a task id
   * to poll (Lyria). There is no `providerTaskId` to store — the job was
   * never asynchronous — so this only stamps the "generation actually
   * started" instant that `GenerationDispatcher`'s stuck-song reclaim
   * relies on. `markCompleted` follows in the same invocation.
   */
  recordImmediateSubmission(): void {
    if (this.props.status !== SongStatus.GENERATING) {
      throw new BusinessRuleError("A submission can only be recorded while generating.", {
        code: "song.submission_invalid_state",
        context: { songId: this.props.id, status: this.props.status },
      });
    }

    this.props.providerStatus = "submitted";
    this.props.submittedAt = new Date();
    this.props.updatedAt = new Date();
  }

  recordSubmission(details: SongSubmissionDetails): void {
    if (this.props.status !== SongStatus.GENERATING) {
      throw new BusinessRuleError("A submission can only be recorded while generating.", {
        code: "song.submission_invalid_state",
        context: { songId: this.props.id, status: this.props.status },
      });
    }

    const providerTaskId = Song.requireNonEmpty(details.providerTaskId, "providerTaskId");

    this.props.providerTaskId = providerTaskId;
    this.props.providerTraceId = details.providerTraceId ?? null;
    this.props.providerStatus = "submitted";
    this.props.submittedAt = new Date();
    this.props.updatedAt = new Date();
  }

  /**
   * Records the provider's latest reported status for a still-in-progress
   * poll (Gate 9.3 — Mureka Polling), without transitioning `Song`'s own
   * status — diagnostics only (e.g. "preparing" vs "running"). A
   * provider-side completion is not recorded here: `GenerationPoller`
   * moves straight to `markCompleted` once the audio is downloaded and
   * stored (see Gate 9.4 — Audio Download & Storage). Valid only while
   * `GENERATING`.
   */
  recordProviderStatus(providerStatus: string): void {
    if (this.props.status !== SongStatus.GENERATING) {
      throw new BusinessRuleError("A provider status can only be recorded while generating.", {
        code: "song.provider_status_invalid_state",
        context: { songId: this.props.id, status: this.props.status },
      });
    }

    this.props.providerStatus = Song.requireNonEmpty(providerStatus, "providerStatus");
    this.props.updatedAt = new Date();
  }

  /** Records a successful generation — the only state a Song may ever reach exactly once (see docs/Product/Business_Rules.md). */
  markCompleted(details: SongGenerationDetails): void {
    const providerSongId = Song.requireNonEmpty(details.providerSongId, "providerSongId");
    const audioStorageKey = Song.requireNonEmpty(details.audioStorageKey, "audioStorageKey");
    const now = new Date();

    this.transitionTo(SongStatus.COMPLETED);
    this.props.providerSongId = providerSongId;
    this.props.audioStorageKey = audioStorageKey;
    this.props.duration = details.duration ?? null;
    this.props.providerStatus = "completed";
    this.props.providerError = null;
    this.props.generatedAt = now;
    this.props.completedAt = now;
    // The moment the song becomes shareable is the moment it gets its
    // public token. Minted once and kept: a retry cannot reach this
    // method (`COMPLETED` has no outgoing transition), so a link already
    // sent to a family can never be silently repointed.
    this.props.publicShareToken ??= generatePublicShareToken();
  }

  /** Records a failed generation attempt. Not terminal — see `ALLOWED_TRANSITIONS`. */
  markFailed(reason?: string | null): void {
    this.transitionTo(SongStatus.FAILED);
    this.props.providerStatus = "failed";
    this.props.providerError = reason?.trim() || null;
    this.props.completedAt = new Date();
  }

  /**
   * Resets a `FAILED` song back to `QUEUED` for a manual admin retry
   * (see docs/Product/User_Flow.md — Operational Recovery). Only ever
   * valid from `FAILED` — a lead's approved lyrics, mood, and the music
   * provider are always reused unchanged; this method never touches
   * them, only the status. Clears every provider-submission field
   * (Sprint 9.1) so `GenerationDispatcher` treats the retry as a
   * genuinely fresh submission — a stale `providerTaskId` from the
   * failed attempt must never be polled again.
   */
  retryFromFailure(): void {
    this.transitionTo(SongStatus.QUEUED);
    this.props.providerTaskId = null;
    this.props.providerTraceId = null;
    this.props.providerStatus = null;
    this.props.providerError = null;
    this.props.submittedAt = null;
    this.props.completedAt = null;
  }

  get id(): string {
    return this.props.id;
  }

  get leadId(): string {
    return this.props.leadId;
  }

  get lyricsId(): string {
    return this.props.lyricsId;
  }

  get moodId(): string {
    return this.props.moodId;
  }

  get provider(): string {
    return this.props.provider;
  }

  get providerModel(): string | null {
    return this.props.providerModel;
  }

  get providerSongId(): string | null {
    return this.props.providerSongId;
  }

  get providerTaskId(): string | null {
    return this.props.providerTaskId;
  }

  get providerTraceId(): string | null {
    return this.props.providerTraceId;
  }

  get providerStatus(): string | null {
    return this.props.providerStatus;
  }

  get providerError(): string | null {
    return this.props.providerError;
  }

  get audioStorageKey(): string | null {
    return this.props.audioStorageKey;
  }

  get duration(): number | null {
    return this.props.duration;
  }

  get status(): SongStatus {
    return this.props.status;
  }

  get submittedAt(): Date | null {
    return this.props.submittedAt;
  }

  get generatedAt(): Date | null {
    return this.props.generatedAt;
  }

  get completedAt(): Date | null {
    return this.props.completedAt;
  }

  get emailedAt(): Date | null {
    return this.props.emailedAt;
  }

  get publicShareToken(): string | null {
    return this.props.publicShareToken;
  }

  /**
   * Whether this song may be served from its public share page: it
   * finished, it has audio, and it still has a token. Expressed over the
   * domain's existing states rather than a new "published" flag, so
   * there is one definition of "ready" and clearing the token is enough
   * to revoke the link.
   */
  get isPubliclyShareable(): boolean {
    return (
      this.props.status === SongStatus.COMPLETED &&
      this.props.audioStorageKey !== null &&
      this.props.publicShareToken !== null
    );
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  toSnapshot(): SongSnapshot {
    return {
      id: this.props.id,
      leadId: this.props.leadId,
      lyricsId: this.props.lyricsId,
      moodId: this.props.moodId,
      provider: this.props.provider,
      providerModel: this.props.providerModel,
      providerSongId: this.props.providerSongId,
      providerTaskId: this.props.providerTaskId,
      providerTraceId: this.props.providerTraceId,
      providerStatus: this.props.providerStatus,
      providerError: this.props.providerError,
      audioStorageKey: this.props.audioStorageKey,
      duration: this.props.duration,
      status: this.props.status,
      submittedAt: this.props.submittedAt,
      generatedAt: this.props.generatedAt,
      completedAt: this.props.completedAt,
      emailedAt: this.props.emailedAt,
      publicShareToken: this.props.publicShareToken,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
    };
  }
}
