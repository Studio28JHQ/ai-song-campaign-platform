import type { Lyrics as PrismaLyricsRecord, Prisma } from "@/generated/prisma/client";
import { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { LyricsProps } from "@/domain/lyrics/types";

/** Translates between the Prisma `Lyrics` model and the `Lyrics` domain entity. Infrastructure-only — never imported outside this layer. */
export class LyricsMapper {
  static toDomain(record: PrismaLyricsRecord): Lyrics {
    const props: LyricsProps = {
      id: record.id,
      leadId: record.leadId,
      moodId: record.moodId,
      prompt: record.prompt,
      content: record.content,
      parentMessage: record.parentMessage,
      musicMood: record.musicMood,
      musicDirection: record.musicDirection,
      // Prisma's generated `Voice` enum is a plain `"FEMALE" | "MALE"`
      // union — structurally identical to the domain `Voice` type, so
      // no translation map is needed (unlike `SongMapper`'s status maps).
      voice: record.voice,
      approved: record.approved,
      rejectionReason: record.rejectionReason,
      version: record.version,
      createdAt: record.createdAt,
    };

    return Lyrics.fromPersistence(props);
  }

  static toCreateInput(lyrics: Lyrics): Prisma.LyricsUncheckedCreateInput {
    return {
      id: lyrics.id,
      leadId: lyrics.leadId,
      moodId: lyrics.moodId,
      prompt: lyrics.prompt,
      content: lyrics.content,
      parentMessage: lyrics.parentMessage,
      musicMood: lyrics.musicMood,
      musicDirection: lyrics.musicDirection,
      voice: lyrics.voice,
      approved: lyrics.approved,
      rejectionReason: lyrics.rejectionReason,
      version: lyrics.version,
      createdAt: lyrics.createdAt,
    };
  }

  static toUpdateInput(lyrics: Lyrics): Prisma.LyricsUncheckedUpdateInput {
    return {
      approved: lyrics.approved,
      rejectionReason: lyrics.rejectionReason,
    };
  }
}
