import type { SongShareLinks } from "@/application/song/services/songShareUrl";
import { appConfig } from "@/config/app";
import {
  EMAIL_PALETTE,
  escapeHtml,
  renderButton,
  renderDocument,
  renderSupport,
} from "./emailChrome";

const SUBJECT = "¡Tu canción personalizada ya está lista!";

export interface SongReadyEmailContent {
  parentName: string;
  babyName: string;
  audioUrl: string;
  duration: number | null;
  /**
   * The song's public page and the three tracking URLs its share buttons
   * point at, already built by the caller (`buildSongShareLinks`) — this
   * template never sees a token and has no idea one exists. `null` when
   * the song has no public page, in which case the share section is
   * omitted rather than pointed somewhere else.
   */
  shareLinks: SongShareLinks | null;
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

/**
 * The share row: WhatsApp, Facebook and X, each a plain `<a>`. No
 * LinkedIn, by requirement.
 *
 * The buttons no longer point at the platforms directly. They point at
 * this application's own tracking route, which records the click and
 * then redirects to the platform with the message and the song's public
 * URL (see `shareDestinations`). Two consequences worth stating, because
 * getting either wrong is silent:
 *
 * - The message text is no longer built here. It is composed at redirect
 *   time from the platform the route validated, so there is one
 *   definition of what WhatsApp, Facebook and X receive.
 * - The URL shown under "O copia este enlace" and the URL that reaches
 *   the platforms is the song's **public page**, never the tracking URL.
 *   A tracking URL inside a shared message would record an event for
 *   every recipient who opened it.
 */
/**
 * The share row: WhatsApp, Facebook and X, each a plain `<a>` to the
 * network's own public share endpoint. No LinkedIn, by requirement.
 *
 * Every interpolated value goes through `encodeURIComponent` before it
 * reaches a query string and through `escapeHtml` before it reaches the
 * HTML — the two are not interchangeable, and a baby's name containing
 * `&` needs both.
 */
function renderShareSection(babyName: string, links: SongShareLinks): string {
  const url = links.shareUrl;

  const networks = [
    {
      label: "WhatsApp",
      href: links.tracking.whatsapp,
    },
    {
      label: "Facebook",
      href: links.tracking.facebook,
    },
    {
      label: "X",
      href: links.tracking.x,
    },
  ];

  const cells = networks
    .map(
      (network) => `
          <td align="center" width="33.33%" style="padding:0 4px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="background-color:${EMAIL_PALETTE.card};border:1px solid ${EMAIL_PALETTE.primary};border-radius:10px;">
                  <a href="${escapeHtml(network.href)}" style="display:block;padding:12px 6px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;font-weight:bold;color:${EMAIL_PALETTE.primaryDark};text-decoration:none;">${network.label}</a>
                </td>
              </tr>
            </table>
          </td>`,
    )
    .join("");

  // The fourth tile of the approved design is "Copiar enlace". An email
  // cannot run JavaScript, so there is no clipboard to write to; the
  // equivalent that works everywhere is showing the link as selectable
  // text the reader can copy by hand.
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
  <tr>
    <td style="padding:20px;background-color:${EMAIL_PALETTE.primarySoft};border-radius:12px;">
      <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;font-weight:bold;color:${EMAIL_PALETTE.primaryDark};text-align:center;">&#10084;&#65039; Comparte este momento</p>
      <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:${EMAIL_PALETTE.body};text-align:center;">
        Lleva la canción de ${escapeHtml(babyName)} a tu familia y amigos.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>${cells}
        </tr>
      </table>
      <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:${EMAIL_PALETTE.body};text-align:center;">
        O copia este enlace:<br />
        <a href="${escapeHtml(url)}" style="color:${EMAIL_PALETTE.primaryDark};font-weight:bold;word-break:break-all;">${escapeHtml(url)}</a>
      </p>
    </td>
  </tr>
</table>`;
}

/**
 * Builds the subject and HTML body for the one-time "song ready" email.
 * Restyled onto the approved campaign design and extended with a share
 * section; the playback and download links are the same `audioUrl` they
 * always were, resolved fresh from R2 by the caller and never stored.
 *
 * See `emailChrome` for the shared shell, and `shareUrl` for why the
 * share buttons deliberately do not carry `audioUrl`.
 */
export class SongReadyEmailTemplate {
  static subject(): string {
    return SUBJECT;
  }

  static html(content: SongReadyEmailContent): string {
    const campaignName = appConfig.campaign.name;
    const supportEmail = appConfig.admin.email;
    const duration = formatDuration(content.duration);
    const parentName = escapeHtml(content.parentName);
    const babyName = escapeHtml(content.babyName);

    const durationBlock = duration
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 24px;">
                  <tr>
                    <td style="padding:8px 18px;background-color:${EMAIL_PALETTE.primarySoft};border-radius:20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:bold;color:${EMAIL_PALETTE.primaryDark};">&#128336; Duración: ${duration}</td>
                  </tr>
                </table>`
      : "";

    const contentHtml = `
                <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:${EMAIL_PALETTE.body};">Hola ${parentName},</p>

                <h1 style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:32px;font-weight:bold;color:${EMAIL_PALETTE.heading};">&#127925; ¡Tu canción personalizada ya está lista!</h1>

                <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:${EMAIL_PALETTE.body};">
                  ¡Gracias por participar en ${escapeHtml(campaignName)}! La canción personalizada que creamos para <strong style="color:${EMAIL_PALETTE.heading};">${babyName}</strong> ya está lista para disfrutar.
                </p>

                ${durationBlock}

                ${renderButton({
                  href: content.audioUrl,
                  label: "&#9654;&#65039; Escuchar la canción",
                  variant: "primary",
                })}

                <div style="height:12px;line-height:12px;font-size:12px;">&nbsp;</div>

                ${renderButton({
                  href: content.audioUrl,
                  label: "&#8595; Descargar la canción",
                  variant: "secondary",
                  download: true,
                })}

                ${content.shareLinks ? renderShareSection(content.babyName, content.shareLinks) : ""}

                ${renderSupport(supportEmail)}`;

    return renderDocument({
      title: SUBJECT,
      preheader: `La canción de ${content.babyName} ya está lista para escuchar.`,
      contentHtml,
      campaignName,
    });
  }
}
