import type { AlertEmailSender } from "@/application/alerting/contracts/AlertEmailSender";
import type { OperationalAlert } from "@/application/alerting/contracts/OperationalAlert";
import type {
  LeadEmailSender,
  WelcomeEmailInput,
} from "@/application/lead/contracts/LeadEmailSender";
import type {
  SongEmailSender,
  SongReadyEmailInput,
} from "@/application/song/contracts/SongEmailSender";
import { appConfig } from "@/config/app";
import { InfrastructureError } from "@/shared/errors";
import { OperationalAlertEmailTemplate } from "./OperationalAlertEmailTemplate";
import { ResendClient } from "./ResendClient";
import { SongReadyEmailTemplate } from "./SongReadyEmailTemplate";
import { WelcomeEmailTemplate } from "./WelcomeEmailTemplate";

/**
 * Sends every email this application sends via Resend: the one-time
 * "song ready" email, the post-registration welcome/resume-link email,
 * and the operational alert. Orchestrates building the template and
 * calling the client — mirrors `MurekaSongService`'s "build payload →
 * call provider" shape.
 */
export class ResendEmailService implements SongEmailSender, LeadEmailSender, AlertEmailSender {
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
        shareLinks: input.shareLinks,
      }),
    });
  }

  /**
   * Operational Alerting. The recipient comes from
   * `appConfig.alerts.recipient` and from nowhere else — see
   * `AlertEmailSender` for why an alert is not addressable per call.
   *
   * Sent from the campaign's own verified `EMAIL_FROM`, so this needs no
   * new domain or sender setup in Resend: it reuses the same credential
   * and the same verified domain the parent-facing emails already
   * deliver on.
   */
  async sendAlertEmail(alert: OperationalAlert): Promise<void> {
    const recipient = appConfig.alerts.recipient;

    // Refused loudly rather than sent somewhere else or silently dropped.
    // `OperationalAlertService` catches this and logs it, so a deployment
    // that forgot the variable leaves this exact sentence in the logs
    // instead of looking like a working alerting setup that never fires.
    if (!recipient) {
      throw new InfrastructureError(
        "ALERT_EMAIL_TO is not configured, so no operational alert can be delivered.",
        { code: "alerts.recipient_not_configured", context: { kind: alert.kind } },
      );
    }

    await this.client.send({
      from: appConfig.resend.fromAddress,
      to: recipient,
      subject: OperationalAlertEmailTemplate.subject(alert),
      html: OperationalAlertEmailTemplate.html(alert),
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
