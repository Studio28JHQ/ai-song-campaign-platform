import { appConfig } from "@/config/app";

const SUBJECT = "¡Bienvenido a la campaña! Aquí tienes tu enlace para continuar";

export interface WelcomeEmailContent {
  parentName: string;
  babyName: string;
  resumeUrl: string;
}

/**
 * Builds the subject and responsive HTML body for the post-registration
 * welcome email — same table-based, inline-styled markup as
 * `SongReadyEmailTemplate`, for the same reason (the layout most email
 * clients render consistently, no template engine needed for a single,
 * fixed email). Its whole purpose is delivering `resumeUrl` — the emailed
 * "resume journey" link — never any other reference to the lead than
 * their name and their baby's name.
 */
export class WelcomeEmailTemplate {
  static subject(): string {
    return SUBJECT;
  }

  static html(content: WelcomeEmailContent): string {
    const campaignName = appConfig.campaign.name;
    const supportEmail = appConfig.admin.email;

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
                  ¡Gracias por registrarte en ${campaignName}! Ya puedes continuar creando la canción
                  personalizada para ${content.babyName}.
                </p>
                <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
                  Guarda este correo: este mismo enlace te llevará siempre al paso en el que te quedaste,
                  aunque cierres el navegador o cambies de dispositivo.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                  <tr>
                    <td style="border-radius:8px;background-color:#4f46e5;">
                      <a href="${content.resumeUrl}" style="display:inline-block;padding:12px 24px;font-size:15px;color:#ffffff;text-decoration:none;font-weight:bold;">
                        Ver el progreso de mi canción
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
