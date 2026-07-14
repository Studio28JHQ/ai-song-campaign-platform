import type { Song as PrismaSongRecord, Prisma } from "@/generated/prisma/client";
import { SongStatus as PrismaSongStatus } from "@/generated/prisma/client";
import { Song } from "@/domain/song/entities/Song";
import { SongStatus as DomainSongStatus, type SongProps } from "@/domain/song/types";

/**
 * Prisma's `SongStatus` also has a `DELIVERED` value (see
 * prisma/schema.prisma) that belongs to a future email-delivery module —
 * the domain collapses it to `READY` on read, same as `LeadMapper` does
 * for its own out-of-scope persistence states.
 */
const PERSISTENCE_TO_DOMAIN_STATUS: Record<PrismaSongStatus, DomainSongStatus> = {
  PENDING: DomainSongStatus.PENDING,
  GENERATING: DomainSongStatus.GENERATING,
  READY: DomainSongStatus.READY,
  DELIVERED: DomainSongStatus.READY,
  FAILED: DomainSongStatus.FAILED,
};

const DOMAIN_TO_PERSISTENCE_STATUS: Record<DomainSongStatus, PrismaSongStatus> = {
  [DomainSongStatus.PENDING]: PrismaSongStatus.PENDING,
  [DomainSongStatus.GENERATING]: PrismaSongStatus.GENERATING,
  [DomainSongStatus.READY]: PrismaSongStatus.READY,
  [DomainSongStatus.FAILED]: PrismaSongStatus.FAILED,
};

/** Translates between the Prisma `Song` model and the `Song` domain entity. Infrastructure-only — never imported outside this layer. */
export class SongMapper {
  static toDomain(record: PrismaSongRecord): Song {
    const props: SongProps = {
      id: record.id,
      leadId: record.leadId,
      lyricsId: record.lyricsId,
      moodId: record.moodId,
      provider: record.provider,
      providerSongId: record.providerSongId,
      audioUrl: record.audioUrl,
      duration: record.duration,
      status: PERSISTENCE_TO_DOMAIN_STATUS[record.status],
      generatedAt: record.generatedAt,
      emailedAt: record.emailedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };

    return Song.fromPersistence(props);
  }

  static toCreateInput(song: Song): Prisma.SongUncheckedCreateInput {
    return {
      id: song.id,
      leadId: song.leadId,
      lyricsId: song.lyricsId,
      moodId: song.moodId,
      provider: song.provider,
      providerSongId: song.providerSongId,
      audioUrl: song.audioUrl,
      duration: song.duration,
      status: DOMAIN_TO_PERSISTENCE_STATUS[song.status],
      generatedAt: song.generatedAt,
      createdAt: song.createdAt,
      updatedAt: song.updatedAt,
    };
  }

  static toUpdateInput(song: Song): Prisma.SongUncheckedUpdateInput {
    return {
      providerSongId: song.providerSongId,
      audioUrl: song.audioUrl,
      duration: song.duration,
      status: DOMAIN_TO_PERSISTENCE_STATUS[song.status],
      generatedAt: song.generatedAt,
      updatedAt: song.updatedAt,
    };
  }
}
