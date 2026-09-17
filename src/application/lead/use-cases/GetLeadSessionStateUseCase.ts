import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import type { AudioUrlResolver } from "@/application/song/contracts/AudioUrlResolver";
import { BusinessRuleError } from "@/shared/errors";
import type { GetLeadSessionStateRequest } from "../dto/GetLeadSessionStateRequest";
import type { GetLeadSessionStateResponse } from "../dto/GetLeadSessionStateResponse";

/**
 * Reconstructs everything the parent-facing UI needs to resume the flow
 * after a page refresh — remaining attempts, the approved Lyrics version
 * (if any), the latest still-pending version awaiting the parent's
 * approval (if any), and the current Song (if any) — entirely from existing
 * repositories, mirroring the Admin module's `GetLeadDetailUseCase`
 * composition pattern. This is the backend authority GATE 6.6 requires:
 * the frontend never reconstructs this state from client-side storage.
 */
export class GetLeadSessionStateUseCase {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly lyricsRepository: LyricsRepository,
    private readonly songRepository: SongRepository,
    private readonly audioUrlResolver: AudioUrlResolver,
  ) {}

  async execute(request: GetLeadSessionStateRequest): Promise<GetLeadSessionStateResponse> {
    const lead = await this.leadRepository.findById(request.leadId);

    if (!lead) {
      throw new BusinessRuleError("Lead not found.", {
        code: "session.lead_not_found",
        context: { leadId: request.leadId },
      });
    }

    const [allLyrics, song] = await Promise.all([
      this.lyricsRepository.findAllByLead(lead.id),
      this.songRepository.findByLead(lead.id),
    ]);

    // Both Lyrics facts this endpoint reports are derived from that one
    // read (already ordered by version ascending — see
    // `PrismaLyricsRepository.findAllByLead`) rather than a second,
    // narrower query: the `lyrics_one_approved_per_lead` partial unique
    // index (`ON lyrics("leadId") WHERE approved = true`) means at most
    // one version per lead can ever be approved, so picking it out of
    // the full list returns exactly what `findApprovedByLead` would
    // have.
    const approvedLyrics = allLyrics.find((lyrics) => lyrics.approved) ?? null;

    // The newest version, and only while it is still unapproved — that,
    // and nothing else, is "the step the parent left off at", which the
    // emailed resume link promises to return them to. Restoring it stops
    // that visit from showing a blank generation form and silently
    // spending another attempt re-generating what they already had.
    //
    // Deliberately keyed on the *newest* version rather than on "is
    // there any unapproved version": a version left unapproved behind an
    // approved one is not pending (approval is terminal — see
    // `GenerateLyricsForLeadUseCase`, which refuses to generate past it),
    // while a version created after an approval — rare, but present in
    // real data — is still the newest thing this lead has. Reporting it
    // never overrides the approved version for the parent either way:
    // `LyricsWorkflow` checks `approvedLyrics` first.
    const latestLyrics = allLyrics.at(-1) ?? null;
    const pendingLyrics = latestLyrics && !latestLyrics.approved ? latestLyrics : null;

    // Resolved fresh from the persisted R2 key — never a stored URL (see
    // `AudioUrlResolver`).
    const audioUrl = song?.audioStorageKey
      ? await this.audioUrlResolver.resolve(song.audioStorageKey)
      : null;

    return {
      babyName: lead.babyName,
      remainingAttempts: lead.remainingAttempts,
      leadStatus: lead.status,
      approvedLyrics: approvedLyrics
        ? {
            id: approvedLyrics.id,
            content: approvedLyrics.content,
            version: approvedLyrics.version,
          }
        : null,
      pendingLyrics: pendingLyrics
        ? {
            id: pendingLyrics.id,
            content: pendingLyrics.content,
            version: pendingLyrics.version,
            moodId: pendingLyrics.moodId,
            parentMessage: pendingLyrics.parentMessage,
            voice: pendingLyrics.voice,
          }
        : null,
      song: song ? { id: song.id, status: song.status, audioUrl, duration: song.duration } : null,
    };
  }
}
