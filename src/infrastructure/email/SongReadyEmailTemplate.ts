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
   * The song's own public share page (see `buildSongShareUrl`), already
   * built by the caller — this template never sees a token and has no
   * idea one exists. `null` when the song has no public page, in which
   * case the share section is omitted rather than pointed somewhere
   * else.
   */
  shareUrl: string | null;
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

/**
 * What the share buttons point at — and, just as importantly, what they
 * do not.
 *
 * They share `shareUrl`: the song's **own** public page,
 * `/song/share/[shareToken]`, so a recipient opens a page about this
 * child and can actually listen. Nothing else in this email is
 * shareable. `audioUrl` is a Cloudflare R2 presigned link whose query
 * string carries `X-Amz-Credential` — the bucket's access key id — and
 * which stops working after `R2_SIGNED_URL_EXPIRY_SECONDS` (7 days), so
 * it stays exactly where it belongs, on the parent's own "escuchar" and
 * "descargar" buttons. The resume link is the family's session and is
 * not in this email at all.
 */
function shareMessage(babyName: string): string {
  return `🎵 Escucha la canción personalizada que creamos para ${babyName} en ${appConfig.campaign.name} ❤️`;
}

/**
 * The same sentence without emoji, for WhatsApp and Facebook.
 *
 * Why two messages rather than one. Our encoding is not the problem and
 * removing the emoji is not a workaround for a bug in this file: the
 * WhatsApp href we emit is pure ASCII, percent-encoded UTF-8
 * (`%F0%9F%8E%B5` for the note, `%C3%B3` for the ó), and
 * `decodeURIComponent` round-trips it exactly. What a real share showed
 * is that the emoji still arrived as the replacement character `�`
 * in WhatsApp while the accented text arrived intact — so the loss
 * happens somewhere past our URL, in a chain we neither control nor can
 * test from here. The fix is therefore to stop depending on emoji for
 * the channels where it was observed to break, not to re-encode
 * something that is already correct and not to strip characters with a
 * regex after the fact.
 *
 * X keeps `shareMessage` above, unchanged: a real share confirmed it
 * renders the emoji correctly there, and there is no reason to change a
 * channel that works.
 */
function plainShareMessage(babyName: string): string {
  return `¡Escucha la canción personalizada que creamos para ${babyName} en ${appConfig.campaign.name}!`;
}

/**
 * The share row: WhatsApp, Facebook and X, each a plain `<a>` to the
 * network's own public share endpoint. No LinkedIn, by requirement.
 *
 * Every interpolated value goes through `encodeURIComponent` before it
 * reaches a query string and through `escapeHtml` before it reaches the
 * HTML — the two are not interchangeable, and a baby's name containing
 * `&` needs both.
 */
function renderShareSection(babyName: string, url: string): string {
  const message = shareMessage(babyName);
  const plainMessage = plainShareMessage(babyName);
  const encodedUrl = encodeURIComponent(url);
  const encodedMessage = encodeURIComponent(message);

  const networks = [
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodeURIComponent(`${plainMessage} ${url}`)}`,
    },
    {
      // `quote` is what carries the text through Facebook's share dialog.
      // `u` alone hands Facebook nothing but the link, and it then builds
      // the whole post from the page's Open Graph tags — which is why a
      // real share showed the right song with no sentence of ours. The
      // two parameters stay separate: `u` is the song's page, `quote` is
      // the message, and the URL is never repeated inside the text.
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodeURIComponent(plainMessage)}`,
    },
    {
      // Unchanged, deliberately: a real share confirmed X works.
      label: "X",
      href: `https://twitter.com/intent/tweet?text=${encodedMessage}&url=${encodedUrl}`,
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

                ${content.shareUrl ? renderShareSection(content.babyName, content.shareUrl) : ""}

                ${renderSupport(supportEmail)}`;

    return renderDocument({
      title: SUBJECT,
      preheader: `La canción de ${content.babyName} ya está lista para escuchar.`,
      contentHtml,
      campaignName,
    });
  }
}
