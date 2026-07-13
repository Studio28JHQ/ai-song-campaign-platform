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
