import type {
  SongEmailSender,
  SongReadyEmailInput,
} from "@/application/song/contracts/SongEmailSender";
import { ResendClient } from "./ResendClient";
import { SongReadyEmailTemplate } from "./SongReadyEmailTemplate";

/**
 * Resend does not publish a fixed "from" domain — it must be a domain the
 * campaign has verified in the Resend dashboard. This placeholder should
 * be replaced with that verified address before this integration is
 * pointed at production traffic (same caveat as `SunoClient`'s endpoint).
 */
const FROM_ADDRESS = "AI Song Campaign <no-reply@campaign.example.com>";

/**
 * Sends the one-time "song ready" email via Resend. Orchestrates
 * building the template and calling the client — mirrors
 * `SunoSongService`'s "build payload → call provider" shape.
 */
export class ResendEmailService implements SongEmailSender {
  constructor(private readonly client: ResendClient = new ResendClient()) {}

  async sendSongReadyEmail(input: SongReadyEmailInput): Promise<void> {
    await this.client.send({
      from: FROM_ADDRESS,
      to: input.to,
      subject: SongReadyEmailTemplate.subject(),
      html: SongReadyEmailTemplate.html({
        parentName: input.parentName,
        babyName: input.babyName,
        audioUrl: input.audioUrl,
        duration: input.duration,
      }),
    });
  }
}
