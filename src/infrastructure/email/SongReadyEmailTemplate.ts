import { appConfig } from "@/config/app";

const SUBJECT = "¡Tu canción personalizada ya está lista!";

export interface SongReadyEmailContent {
  parentName: string;
  babyName: string;
  audioUrl: string;
  duration: number | null;
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

/**
 * Builds the subject and responsive HTML body for the one-time "song
 * ready" email. Table-based, inline-styled markup — the layout most email
 * clients render consistently — rather than a CSS framework or template
 * engine, consistent with the project's "no unnecessary abstractions"
 * principle for a single, fixed email.
 */
export class SongReadyEmailTemplate {
  static subject(): string {
    return SUBJECT;
  }

  static html(content: SongReadyEmailContent): string {
    const campaignName = appConfig.campaign.name;
    const supportEmail = appConfig.admin.email;
    const duration = formatDuration(content.duration);

    return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color:#111827;padding:24px;text-align:center;">
                <span style="color:#ffffff;font-size:18px;font-weight:bold;">${campaignName}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 24px;">
                <p style="margin:0 0 16px;font-size:16px;color:#111827;">Hola ${content.parentName},</p>
                <p style="margin:0 0 16px;font-size:16px;color:#111827;">
                  ¡Gracias por participar en ${campaignName}! La canción personalizada que creamos para
                  ${content.babyName} ya está lista para disfrutar.
                </p>
                ${duration ? `<p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Duración: ${duration}</p>` : ""}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
                  <tr>
                    <td style="border-radius:8px;background-color:#4f46e5;">
                      <a href="${content.audioUrl}" style="display:inline-block;padding:12px 24px;font-size:15px;color:#ffffff;text-decoration:none;font-weight:bold;">
                        &#9654; Escuchar la canción
                      </a>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                  <tr>
                    <td style="border-radius:8px;border:1px solid #4f46e5;">
                      <a href="${content.audioUrl}" download style="display:inline-block;padding:12px 24px;font-size:15px;color:#4f46e5;text-decoration:none;font-weight:bold;">
                        &#8595; Descargar la canción
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
                  ¿Necesitas ayuda? Escríbenos a
                  <a href="mailto:${supportEmail}" style="color:#4f46e5;">${supportEmail}</a>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background-color:#f9fafb;text-align:center;">
                <p style="margin:0;font-size:12px;color:#9ca3af;">
                  &copy; ${new Date().getFullYear()} ${campaignName}. Este es un correo único de la campaña.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }
}
