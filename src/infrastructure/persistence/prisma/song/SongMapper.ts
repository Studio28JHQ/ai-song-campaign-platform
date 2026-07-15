import type { Song as PrismaSongRecord, Prisma } from "@/generated/prisma/client";
import { SongStatus as PrismaSongStatus } from "@/generated/prisma/client";
import { Song } from "@/domain/song/entities/Song";
import { SongStatus as DomainSongStatus, type SongProps } from "@/domain/song/types";

/**
 * Prisma's `SongStatus` also has a `DELIVERED` value (see
 * prisma/schema.prisma) that belongs to a future email-delivery module —
 * the domain collapses it to `COMPLETED` on read, same as `LeadMapper`
 * does for its own out-of-scope persistence states.
 */
const PERSISTENCE_TO_DOMAIN_STATUS: Record<PrismaSongStatus, DomainSongStatus> = {
  QUEUED: DomainSongStatus.QUEUED,
  GENERATING: DomainSongStatus.GENERATING,
  COMPLETED: DomainSongStatus.COMPLETED,
  DELIVERED: DomainSongStatus.COMPLETED,
  FAILED: DomainSongStatus.FAILED,
};

const DOMAIN_TO_PERSISTENCE_STATUS: Record<DomainSongStatus, PrismaSongStatus> = {
  [DomainSongStatus.QUEUED]: PrismaSongStatus.QUEUED,
  [DomainSongStatus.GENERATING]: PrismaSongStatus.GENERATING,
  [DomainSongStatus.COMPLETED]: PrismaSongStatus.COMPLETED,
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
      providerTaskId: record.providerTaskId,
      providerTraceId: record.providerTraceId,
      providerStatus: record.providerStatus,
      providerError: record.providerError,
      audioStorageKey: record.audioStorageKey,
      duration: record.duration,
      status: PERSISTENCE_TO_DOMAIN_STATUS[record.status],
      submittedAt: record.submittedAt,
      generatedAt: record.generatedAt,
      completedAt: record.completedAt,
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
      providerTaskId: song.providerTaskId,
      providerTraceId: song.providerTraceId,
      providerStatus: song.providerStatus,
      providerError: song.providerError,
      audioStorageKey: song.audioStorageKey,
      duration: song.duration,
      status: DOMAIN_TO_PERSISTENCE_STATUS[song.status],
      submittedAt: song.submittedAt,
      generatedAt: song.generatedAt,
      completedAt: song.completedAt,
      createdAt: song.createdAt,
      updatedAt: song.updatedAt,
    };
  }

  static toUpdateInput(song: Song): Prisma.SongUncheckedUpdateInput {
    return {
      providerSongId: song.providerSongId,
      providerTaskId: song.providerTaskId,
      providerTraceId: song.providerTraceId,
      providerStatus: song.providerStatus,
      providerError: song.providerError,
      audioStorageKey: song.audioStorageKey,
      duration: song.duration,
      status: DOMAIN_TO_PERSISTENCE_STATUS[song.status],
      submittedAt: song.submittedAt,
      generatedAt: song.generatedAt,
      completedAt: song.completedAt,
      updatedAt: song.updatedAt,
    };
  }
}
