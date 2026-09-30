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
      providerModel: record.providerModel,
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
      publicShareToken: record.publicShareToken,
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
      providerModel: song.providerModel,
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
      publicShareToken: song.publicShareToken,
      createdAt: song.createdAt,
      updatedAt: song.updatedAt,
    };
  }

  static toUpdateInput(song: Song): Prisma.SongUncheckedUpdateInput {
    return {
      // Both are written at submission time by `GenerationDispatcher`
      // (`Song.assignProvider`), and rewritten if the whitelisted fallback
      // provider takes over — so an update has to carry them, unlike the
      // single-provider version of this mapper where `provider` was fixed
      // at creation.
      provider: song.provider,
      providerModel: song.providerModel,
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
      // Carried on update because it is minted by `markCompleted`, which
      // is persisted through this path — without it the token would be
      // generated in memory and immediately thrown away.
      publicShareToken: song.publicShareToken,
      updatedAt: song.updatedAt,
    };
  }
}
