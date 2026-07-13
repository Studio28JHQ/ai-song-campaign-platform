import { BusinessRuleError, ValidationError } from "@/shared/errors";
import {
  SongStatus,
  type CreateSongInput,
  type SongGenerationDetails,
  type SongProps,
  type SongSnapshot,
} from "../types";

const DEFAULT_PROVIDER = "suno";

/**
 * `FAILED -> GENERATING` is allowed so a transient provider failure can be
 * retried against the *same* row: `Song.leadId` is unique at the database
 * level (see docs/Architecture/Database_Model.md), so a failed attempt
 * must not permanently occupy a lead's one-song slot. Only a `READY` song
 * counts as the lead's "final song" — see docs/Product/Business_Rules.md.
 */
const ALLOWED_TRANSITIONS: Record<SongStatus, ReadonlyArray<SongStatus>> = {
  [SongStatus.PENDING]: [SongStatus.GENERATING],
  [SongStatus.GENERATING]: [SongStatus.READY, SongStatus.FAILED],
  [SongStatus.FAILED]: [SongStatus.GENERATING],
  [SongStatus.READY]: [],
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
      audioUrl: null,
      duration: null,
      status: SongStatus.PENDING,
      generatedAt: null,
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

  /** Moves the song into the active generation call. Valid from `PENDING` or, on retry, `FAILED`. */
  markGenerating(): void {
    this.transitionTo(SongStatus.GENERATING);
  }

  /** Records a successful generation — the only state a Song may ever reach exactly once (see docs/Product/Business_Rules.md). */
  markReady(details: SongGenerationDetails): void {
    const providerSongId = Song.requireNonEmpty(details.providerSongId, "providerSongId");
    const audioUrl = Song.requireNonEmpty(details.audioUrl, "audioUrl");

    this.transitionTo(SongStatus.READY);
    this.props.providerSongId = providerSongId;
    this.props.audioUrl = audioUrl;
    this.props.duration = details.duration ?? null;
    this.props.generatedAt = new Date();
  }

  /** Records a failed generation attempt. Not terminal — see `ALLOWED_TRANSITIONS`. */
  markFailed(): void {
    this.transitionTo(SongStatus.FAILED);
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

  get audioUrl(): string | null {
    return this.props.audioUrl;
  }

  get duration(): number | null {
    return this.props.duration;
  }

  get status(): SongStatus {
    return this.props.status;
  }

  get generatedAt(): Date | null {
    return this.props.generatedAt;
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
      audioUrl: this.props.audioUrl,
      duration: this.props.duration,
      status: this.props.status,
      generatedAt: this.props.generatedAt,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
    };
  }
}
