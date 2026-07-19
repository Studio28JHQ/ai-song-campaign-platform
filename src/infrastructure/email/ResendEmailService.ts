import type {
  LeadEmailSender,
  WelcomeEmailInput,
} from "@/application/lead/contracts/LeadEmailSender";
import type {
  SongEmailSender,
  SongReadyEmailInput,
} from "@/application/song/contracts/SongEmailSender";
import { appConfig } from "@/config/app";
import { ResendClient } from "./ResendClient";
import { SongReadyEmailTemplate } from "./SongReadyEmailTemplate";
import { WelcomeEmailTemplate } from "./WelcomeEmailTemplate";

/**
 * Sends every transactional campaign email via Resend — the one-time
 * "song ready" email and the post-registration welcome/resume-link email.
 * Orchestrates building the template and calling the client — mirrors
 * `MurekaSongService`'s "build payload → call provider" shape.
 */
export class ResendEmailService implements SongEmailSender, LeadEmailSender {
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

  async sendWelcomeEmail(input: WelcomeEmailInput): Promise<void> {
    await this.client.send({
      from: appConfig.resend.fromAddress,
      to: input.to,
      subject: WelcomeEmailTemplate.subject(),
      html: WelcomeEmailTemplate.html({
        parentName: input.parentName,
        babyName: input.babyName,
        resumeUrl: input.resumeUrl,
      }),
    });
  }
}
