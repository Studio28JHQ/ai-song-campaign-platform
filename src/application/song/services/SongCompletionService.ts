import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { logger } from "@/shared/logger/logger";
import type { AudioProcessor } from "../contracts/AudioProcessor";
import type { AudioStorage } from "../contracts/AudioStorage";
import type { AudioUrlResolver } from "../contracts/AudioUrlResolver";
import type { CampaignGate } from "../contracts/CampaignGate";
import type { EmailDeliveryTracker } from "../contracts/EmailDeliveryTracker";
import type { GeneratedAudio } from "../contracts/SongGenerationProvider";
import type { SongEmailSender } from "../contracts/SongEmailSender";
import { buildSongShareLinks } from "@/application/song/services/songShareUrl";

const AUDIO_STORAGE_CONTENT_TYPE_FALLBACK = "audio/mpeg";

/**
 * Everything that happens once some provider has produced audio: FFmpeg
 * post-processing, the R2 upload, persisting `COMPLETED`, counting the song
 * toward the campaign's budget, and the one-time "song ready" email.
 *
 * Extracted verbatim from `GenerationPoller.downloadStoreAndDeliver` when a
 * second provider arrived, for one reason: Mureka's audio reaches this
 * point after `GenerationPoller` downloads it from a URL, while Lyria's
 * arrives inline from `GenerationDispatcher`'s own submission call. Both
 * must then be treated identically — same 60-second cap, same storage key
 * convention, same idempotent email — so this lives in exactly one place
 * and both callers hand it bytes. The only thing the two paths do
 * differently is how they obtained those bytes.
 *
 * Behaviour is unchanged from the single-provider version, including the
 * ordering guarantees that matter: the email is sent only after the
 * download, the upload, and the repository write have all already
 * succeeded; any failure before that marks the Song `FAILED` and rethrows;
 * and a failure of the email itself is swallowed, never allowed to undo an
 * otherwise-successful generation (`Song` has no `COMPLETED -> FAILED`
 * transition).
 */
export class SongCompletionService {
  constructor(
    private readonly songRepository: SongRepository,
    private readonly audioProcessor: AudioProcessor,
    private readonly audioStorage: AudioStorage,
    private readonly audioUrlResolver: AudioUrlResolver,
    private readonly leadRepository: LeadRepository,
    private readonly emailSender: SongEmailSender,
    private readonly deliveryTracker: EmailDeliveryTracker,
    private readonly campaignGate: CampaignGate,
  ) {}

  /**
   * Processes, stores and delivers `audio` for `song`, returning the
   * persisted `COMPLETED` Song. Marks the Song `FAILED` and rethrows if
   * processing, storage or persistence fails — never leaves it stuck
   * `GENERATING`, and never marks it `COMPLETED` unless the audio is
   * genuinely stored.
   */
  async complete(song: Song, audio: GeneratedAudio & { providerSongId: string }): Promise<Song> {
    try {
      const processed = await this.audioProcessor.process(audio.bytes);
      const storageKey = `songs/${song.id}.mp3`;

      await this.audioStorage.upload(
        storageKey,
        processed.bytes,
        audio.contentType || AUDIO_STORAGE_CONTENT_TYPE_FALLBACK,
      );

      song.markCompleted({
        providerSongId: audio.providerSongId,
        audioStorageKey: storageKey,
        duration: processed.durationSeconds,
      });
      const updated = await this.songRepository.update(song);

      logger.info("generation_provider_completed", {
        songId: updated.id,
        provider: updated.provider,
        providerModel: updated.providerModel,
        status: updated.status,
        durationSeconds: updated.duration,
      });

      await this.incrementCampaignSongsGenerated(updated);
      await this.deliverReadyEmail(updated);

      return updated;
    } catch (error) {
      song.markFailed(error instanceof Error ? error.message : String(error));
      await this.songRepository.update(song);
      throw error;
    }
  }

  /**
   * Counts this Song toward its campaign's `maximumSongs` budget — never
   * before `COMPLETED` is already persisted, and never allowed to undo a
   * successful generation if it fails (same non-blocking pattern as
   * `deliverReadyEmail`).
   */
  private async incrementCampaignSongsGenerated(song: Song): Promise<void> {
    try {
      const lead = await this.leadRepository.findById(song.leadId);
      if (!lead) return;

      await this.campaignGate.incrementSongsGenerated(lead.campaignId);
    } catch (error) {
      logger.error("Failed to increment campaign songsGenerated counter", {
        songId: song.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Claims delivery before sending: the claim is atomic at the database
   * level (see `EmailDeliveryTracker`), so even if this ran twice for the
   * same song, only one caller ever sends. Never rethrows — an email
   * failure must not undo an otherwise-successful generation, and
   * `COMPLETED -> FAILED` isn't a transition `Song` allows.
   */
  private async deliverReadyEmail(song: Song): Promise<void> {
    try {
      const claimed = await this.deliveryTracker.claimDelivery(song.id);
      if (!claimed) return;

      const lead = await this.leadRepository.findById(song.leadId);
      if (!lead || !song.audioStorageKey) return;

      const audioUrl = await this.audioUrlResolver.resolve(song.audioStorageKey);

      await this.emailSender.sendSongReadyEmail({
        to: lead.email.toString(),
        parentName: lead.parentName,
        babyName: lead.babyName,
        songId: song.id,
        audioUrl,
        duration: song.duration,
        // Minted by `Song.markCompleted`, which has already run by the
        // time this song is being emailed.
        shareLinks: buildSongShareLinks(song.publicShareToken),
      });
    } catch (error) {
      logger.error("Failed to send song-ready email", {
        songId: song.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
