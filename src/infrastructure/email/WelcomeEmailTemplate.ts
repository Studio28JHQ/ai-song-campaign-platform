import { appConfig } from "@/config/app";
import {
  EMAIL_PALETTE,
  escapeHtml,
  renderButton,
  renderDocument,
  renderSupport,
} from "./emailChrome";

const SUBJECT = "¡Bienvenido a la campaña! Aquí tienes tu enlace para continuar";

export interface WelcomeEmailContent {
  parentName: string;
  babyName: string;
  resumeUrl: string;
}

/**
 * The three steps shown under "¿Qué sigue?".
 *
 * Worded against what the product actually does, not against a generic
 * funnel: the parent writes the story and picks a mood, Claude writes the
 * lyrics *which the parent then approves*, and only after that is the
 * song produced. The approval step is the one the campaign most needs
 * them to come back for — 86 of the families without a song are sitting
 * on a generated lyric they never approved — so it is named explicitly
 * rather than folded into "generamos la canción".
 */
const NEXT_STEPS: ReadonlyArray<{ title: string; detail: string }> = [
  {
    title: "Cuéntanos sobre tu bebé",
    detail: "Comparte su historia y elige el estilo musical que más te guste.",
  },
  {
    title: "Revisa y aprueba la letra",
    detail: "Creamos una letra única para tu bebé. Tú decides cuándo está lista.",
  },
  {
    title: "¡Disfruta la canción!",
    detail: "La producimos y te avisamos por correo para que la escuches y la compartas.",
  },
];

function renderNextSteps(): string {
  const rows = NEXT_STEPS.map(
    (step, index) => `
      <tr>
        <td width="36" valign="top" style="padding:0 12px 16px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="28" height="28" align="center" valign="middle" style="width:28px;height:28px;background-color:${EMAIL_PALETTE.primary};border-radius:14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;">${index + 1}</td>
            </tr>
          </table>
        </td>
        <td valign="top" style="padding:0 0 16px;">
          <p style="margin:0 0 2px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;font-weight:bold;color:${EMAIL_PALETTE.heading};">${escapeHtml(step.title)}</p>
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:${EMAIL_PALETTE.body};">${escapeHtml(step.detail)}</p>
        </td>
      </tr>`,
  ).join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
  <tr>
    <td style="padding:0 0 14px;">
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:${EMAIL_PALETTE.heading};">¿Qué sigue?</p>
    </td>
  </tr>
  <tr>
    <td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}
      </table>
    </td>
  </tr>
</table>`;
}

/**
 * Builds the subject and HTML body for the post-registration welcome
 * email. Restyled onto the approved campaign design (banner header,
 * white card, violet CTA, three-step explainer) without changing what it
 * communicates or what it carries: its whole purpose is still delivering
 * `resumeUrl` — the emailed "resume journey" link — and it still
 * references the lead by nothing but their name and their baby's name.
 *
 * See `emailChrome` for the shared shell and for why the markup is
 * table-based with inline styles only.
 */
export class WelcomeEmailTemplate {
  static subject(): string {
    return SUBJECT;
  }

  static html(content: WelcomeEmailContent): string {
    const campaignName = appConfig.campaign.name;
    const supportEmail = appConfig.admin.email;
    const parentName = escapeHtml(content.parentName);
    const babyName = escapeHtml(content.babyName);

    const contentHtml = `
                <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:${EMAIL_PALETTE.body};">Hola ${parentName},</p>

                <h1 style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:32px;font-weight:bold;color:${EMAIL_PALETTE.heading};">&#127881; ¡Bienvenido a la campaña!</h1>

                <p style="margin:0 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:${EMAIL_PALETTE.body};">
                  ¡Gracias por registrarte en ${escapeHtml(campaignName)}! Ya puedes continuar creando la canción personalizada para <strong style="color:${EMAIL_PALETTE.heading};">${babyName}</strong>.
                </p>

                ${renderButton({
                  href: content.resumeUrl,
                  label: "&#127925; Ver el progreso de mi canción &rarr;",
                  variant: "primary",
                })}

                ${renderNextSteps()}

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
                  <tr>
                    <td style="padding:18px 20px;background-color:${EMAIL_PALETTE.primarySoft};border-radius:12px;">
                      <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;font-weight:bold;color:${EMAIL_PALETTE.primaryDark};">&#128190; Guarda este correo</p>
                      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:${EMAIL_PALETTE.body};">
                        Este mismo enlace te llevará siempre al paso en el que te quedaste, aunque cierres el navegador o cambies de dispositivo.
                      </p>
                    </td>
                  </tr>
                </table>

                ${renderSupport(supportEmail)}`;

    return renderDocument({
      title: SUBJECT,
      preheader: `Tu enlace para continuar creando la canción de ${content.babyName}.`,
      contentHtml,
      campaignName,
    });
  }
}
