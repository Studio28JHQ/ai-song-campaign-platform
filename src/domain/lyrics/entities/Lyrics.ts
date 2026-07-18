import { BusinessRuleError, ValidationError } from "@/shared/errors";
import type { CreateLyricsInput, LyricsProps, LyricsSnapshot, Voice } from "../types";

/**
 * A single generated lyrics version for a Lead (see
 * docs/Architecture/Domain_Model.md). A Lead may have multiple Lyrics
 * records — one per generation attempt — but at most one may ever be
 * approved; that invariant is enforced both here and, as a final
 * backstop, by a database constraint (see
 * docs/Architecture/Database_Model.md).
 */
export class Lyrics {
  private constructor(private props: LyricsProps) {}

  static create(input: CreateLyricsInput): Lyrics {
    const leadId = Lyrics.requireNonEmpty(input.leadId, "leadId");
    const moodId = Lyrics.requireNonEmpty(input.moodId, "moodId");
    const prompt = Lyrics.requireNonEmpty(input.prompt, "prompt");
    const content = Lyrics.requireNonEmpty(input.content, "content");
    const parentMessage = Lyrics.requireNonEmpty(input.parentMessage, "parentMessage");
    const musicMood = Lyrics.requireNonEmpty(input.musicMood, "musicMood");
    const musicDirection = Lyrics.requireNonEmpty(input.musicDirection, "musicDirection");

    if (!Number.isInteger(input.version) || input.version <= 0) {
      throw new ValidationError("version must be a positive integer.", {
        code: "lyrics.invalid_version",
        context: { version: input.version },
      });
    }

    return new Lyrics({
      id: crypto.randomUUID(),
      leadId,
      moodId,
      prompt,
      content,
      parentMessage,
      musicMood,
      musicDirection,
      voice: input.voice,
      approved: false,
      rejectionReason: null,
      version: input.version,
      createdAt: new Date(),
    });
  }

  /** Rehydrates a Lyrics version from already-persisted state (used by a future repository implementation). */
  static fromPersistence(props: LyricsProps): Lyrics {
    return new Lyrics({ ...props });
  }

  private static requireNonEmpty(value: string, field: string): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new ValidationError(`${field} is required.`, {
        code: `lyrics.${field}_required`,
      });
    }
    return trimmed;
  }

  /**
   * Marks this version as the Lead's approved lyrics — the only version a
   * Song may later be generated from. Cannot be called twice, and a
   * rejected version can never be approved.
   */
  approve(): void {
    if (this.props.approved) {
      throw new BusinessRuleError("This lyrics version has already been approved.", {
        code: "lyrics.already_approved",
        context: { lyricsId: this.props.id },
      });
    }

    if (this.props.rejectionReason !== null) {
      throw new BusinessRuleError("A rejected lyrics version cannot be approved.", {
        code: "lyrics.cannot_approve_rejected",
        context: { lyricsId: this.props.id },
      });
    }

    this.props.approved = true;
  }

  /**
   * Marks this version as rejected (e.g. moderation, or superseded by a
   * regeneration). Cannot be called on an already-approved version.
   */
  reject(reason: string): void {
    const trimmedReason = Lyrics.requireNonEmpty(reason, "reason");

    if (this.props.approved) {
      throw new BusinessRuleError("An approved lyrics version cannot be rejected.", {
        code: "lyrics.cannot_reject_approved",
        context: { lyricsId: this.props.id },
      });
    }

    this.props.rejectionReason = trimmedReason;
  }

  get id(): string {
    return this.props.id;
  }

  get leadId(): string {
    return this.props.leadId;
  }

  get moodId(): string {
    return this.props.moodId;
  }

  get prompt(): string {
    return this.props.prompt;
  }

  get content(): string {
    return this.props.content;
  }

  get parentMessage(): string | null {
    return this.props.parentMessage;
  }

  get musicMood(): string | null {
    return this.props.musicMood;
  }

  get musicDirection(): string | null {
    return this.props.musicDirection;
  }

  get voice(): Voice {
    return this.props.voice;
  }

  get approved(): boolean {
    return this.props.approved;
  }

  get rejectionReason(): string | null {
    return this.props.rejectionReason;
  }

  get version(): number {
    return this.props.version;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  toSnapshot(): LyricsSnapshot {
    return {
      id: this.props.id,
      leadId: this.props.leadId,
      moodId: this.props.moodId,
      prompt: this.props.prompt,
      content: this.props.content,
      parentMessage: this.props.parentMessage,
      musicMood: this.props.musicMood,
      musicDirection: this.props.musicDirection,
      voice: this.props.voice,
      approved: this.props.approved,
      rejectionReason: this.props.rejectionReason,
      version: this.props.version,
      createdAt: this.props.createdAt,
    };
  }
}
