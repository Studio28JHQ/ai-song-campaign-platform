import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { SongStatus } from "@/domain/song/types";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { BusinessRuleError } from "@/shared/errors";
import type { CampaignGate } from "../contracts/CampaignGate";
import type { MoodSunoPromptProvider } from "../contracts/MoodSunoPromptProvider";
import type { SunoGenerator } from "../contracts/SunoGenerator";
import type { GenerateSongRequest } from "../dto/GenerateSongRequest";
import type { GenerateSongResponse } from "../dto/GenerateSongResponse";

/**
 * Generates the one final song a lead may ever have, from their already
 * approved Lyrics. Enforces every rule in docs/Product/Business_Rules.md
 * that requires a repository lookup (the Song entity alone cannot know
 * about the lead, the campaign, or the approved lyrics):
 *
 * - The Lead exists.
 * - The Lead has not already generated a final (READY) song. A `FAILED`
 *   attempt does not count — see `Song`'s transition map — so a
 *   transient Suno failure never permanently blocks a lead, without
 *   ever allowing a second row (the DB's `Song.leadId` unique constraint
 *   only ever sees one row per lead).
 * - The campaign is active and generation is enabled.
 * - The Lead has exactly one approved Lyrics version.
 *
 * Only one Suno request is ever made per call — never multiple
 * variations (see docs/Architecture/External_Services.md).
 */
export class GenerateSongUseCase {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly lyricsRepository: LyricsRepository,
    private readonly songRepository: SongRepository,
    private readonly campaignGate: CampaignGate,
    private readonly moodProvider: MoodSunoPromptProvider,
    private readonly sunoGenerator: SunoGenerator,
  ) {}

  async execute(request: GenerateSongRequest): Promise<GenerateSongResponse> {
    const lead = await this.leadRepository.findById(request.leadId);

    if (!lead) {
      throw new BusinessRuleError("Lead not found.", {
        code: "song.lead_not_found",
        context: { leadId: request.leadId },
      });
    }

    const existingSong = await this.songRepository.findByLead(lead.id);

    if (existingSong && existingSong.status === SongStatus.READY) {
      throw new BusinessRuleError("This lead has already generated a song.", {
        code: "song.already_exists",
        context: { leadId: lead.id, songId: existingSong.id },
      });
    }

    const campaignOk = await this.campaignGate.isActiveAndGenerationEnabled(lead.campaignId);

    if (!campaignOk) {
      throw new BusinessRuleError("Song generation is not currently available for this campaign.", {
        code: "song.campaign_disabled",
        context: { campaignId: lead.campaignId },
      });
    }

    const approvedLyrics = await this.lyricsRepository.findApprovedByLead(lead.id);

    if (!approvedLyrics) {
      throw new BusinessRuleError("This lead does not have approved lyrics yet.", {
        code: "song.lyrics_not_approved",
        context: { leadId: lead.id },
      });
    }

    const mood = await this.moodProvider.getMoodDetails(approvedLyrics.moodId);

    if (!mood) {
      throw new BusinessRuleError("The mood for these lyrics could not be found.", {
        code: "song.mood_not_found",
        context: { moodId: approvedLyrics.moodId },
      });
    }

    let song =
      existingSong ??
      (await this.songRepository.create(
        Song.create({
          leadId: lead.id,
          lyricsId: approvedLyrics.id,
          moodId: approvedLyrics.moodId,
        }),
      ));

    song.markGenerating();
    song = await this.songRepository.update(song);

    try {
      const result = await this.sunoGenerator.generateSong({
        lyrics: approvedLyrics.content,
        moodName: mood.name,
        sunoPrompt: mood.sunoPrompt,
      });

      song.markReady(result);
      song = await this.songRepository.update(song);
    } catch (error) {
      song.markFailed();
      await this.songRepository.update(song);
      throw error;
    }

    return { song: song.toSnapshot() };
  }
}
