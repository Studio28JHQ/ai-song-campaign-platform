import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { SongStatus } from "@/domain/song/types";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { BusinessRuleError } from "@/shared/errors";
import type { CampaignGate } from "../contracts/CampaignGate";
import type { GenerateSongRequest } from "../dto/GenerateSongRequest";
import type { GenerateSongResponse } from "../dto/GenerateSongResponse";

/**
 * Creates the queued Song job: validates every rule in
 * docs/Product/Business_Rules.md that requires a repository lookup (the
 * Song entity alone cannot know about the lead, the campaign, or the
 * approved lyrics), then persists the Song as `QUEUED` and returns
 * immediately — it never calls the music provider itself (see
 * PROJECT_MANIFEST.md — Architecture exception, Sprint 7.5).
 *
 * - The Lead exists.
 * - The Lead has not already generated a final (`COMPLETED`) song. A
 *   `FAILED` attempt does not count — see `Song`'s transition map — so a
 *   transient provider failure never permanently blocks a lead, without
 *   ever allowing a second row (the DB's `Song.leadId` unique constraint
 *   only ever sees one row per lead). Calling this again after a
 *   failure reuses the same row, which is how a manual retry works.
 * - The campaign is active and generation is enabled.
 * - The Lead has exactly one approved Lyrics version.
 *
 * The actual provider call happens in `SongGenerationWorker`, scheduled
 * in the background once lyrics are approved (see
 * `app/api/lyrics/approve/route.ts`) — this split is what makes lyrics
 * approval return immediately without ever generating the song inline
 * (see docs/Architecture/System_Architecture.md).
 */
export class GenerateSongUseCase {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly lyricsRepository: LyricsRepository,
    private readonly songRepository: SongRepository,
    private readonly campaignGate: CampaignGate,
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

    if (existingSong && existingSong.status === SongStatus.COMPLETED) {
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

    const song =
      existingSong ??
      (await this.songRepository.create(
        Song.create({
          leadId: lead.id,
          lyricsId: approvedLyrics.id,
          moodId: approvedLyrics.moodId,
        }),
      ));

    return { song: song.toSnapshot() };
  }
}
