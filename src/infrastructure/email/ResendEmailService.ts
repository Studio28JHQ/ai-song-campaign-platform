import type {
  SongEmailSender,
  SongReadyEmailInput,
} from "@/application/song/contracts/SongEmailSender";
import { appConfig } from "@/config/app";
import { ResendClient } from "./ResendClient";
import { SongReadyEmailTemplate } from "./SongReadyEmailTemplate";

/**
 * Sends the one-time "song ready" email via Resend. Orchestrates
 * building the template and calling the client — mirrors
 * `SunoSongService`'s "build payload → call provider" shape.
 */
export class ResendEmailService implements SongEmailSender {
  constructor(private readonly client: ResendClient = new ResendClient()) {}

  async sendSongReadyEmail(input: SongReadyEmailInput): Promise<void> {
    await this.client.send({
      from: appConfig.resend.fromAddress,
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
