import { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import type { GenerateLyricsRequest } from "../dto/GenerateLyricsRequest";
import type { GenerateLyricsResponse } from "../dto/GenerateLyricsResponse";

/**
 * Records a new lyrics version for a lead.
 *
 * This use case manages lyrics bookkeeping only — the version number is
 * derived from how many versions already exist for the lead; the
 * generated text itself is produced elsewhere (a future Claude
 * integration) and arrives already generated via `request.content`.
 */
export class GenerateLyricsUseCase {
  constructor(private readonly lyricsRepository: LyricsRepository) {}

  async execute(request: GenerateLyricsRequest): Promise<GenerateLyricsResponse> {
    const existingVersions = await this.lyricsRepository.findAllByLead(request.leadId);
    const nextVersion = existingVersions.length + 1;

    const lyrics = Lyrics.create({
      leadId: request.leadId,
      moodId: request.moodId,
      prompt: request.prompt,
      content: request.content,
      version: nextVersion,
      parentMessage: request.parentMessage,
      musicMood: request.musicMood,
      musicDirection: request.musicDirection,
      voice: request.voice,
    });

    const persisted = await this.lyricsRepository.create(lyrics);

    return { lyrics: persisted.toSnapshot() };
  }
}
