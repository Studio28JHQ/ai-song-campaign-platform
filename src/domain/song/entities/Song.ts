import { BusinessRuleError, ValidationError } from "@/shared/errors";
import {
  SongStatus,
  type CreateSongInput,
  type SongGenerationDetails,
  type SongProps,
  type SongSnapshot,
  type SongSubmissionDetails,
} from "../types";

const DEFAULT_PROVIDER = "suno";

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
 * entity only tracks state, it never talks to Suno itself.
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
      providerSongId: null,
      providerTaskId: null,
      providerTraceId: null,
      providerStatus: null,
      providerError: null,
      audioStorageKey: null,
      duration: null,
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
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
    };
  }
}
