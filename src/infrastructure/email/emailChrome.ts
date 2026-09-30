import { buildAppUrl } from "@/config/app";

/**
 * The chrome both campaign emails share: the outer shell, the banner
 * header, the footer, the button markup and the palette.
 *
 * Extracted when the two templates were restyled, because they had
 * drifted into two hand-maintained copies of the same table skeleton and
 * the redesign would have made that three copies of a much larger one.
 * Deliberately not an email framework and not a template engine: a
 * handful of functions returning strings, which is what
 * `WelcomeEmailTemplate` and `SongReadyEmailTemplate` already were.
 *
 * Everything here is written for email clients, not browsers: tables for
 * layout, inline styles only, no `<style>` block, no class selectors, no
 * flexbox or grid, no web fonts, no SVG, no JavaScript. Gmail strips
 * `<head>` styles, and Outlook renders through Word — both read this
 * markup the same way a 2005 browser would.
 */

/**
 * Taken from the campaign theme in `app/globals.css` (`.theme-campaign`)
 * so the emails and the site are recognisably the same product. Repeated
 * here as literals rather than imported: these end up inside a string of
 * HTML sent to a mail server, where a CSS custom property means nothing.
 */
export const EMAIL_PALETTE = {
  /** `--background`, the page behind the card. */
  pageBackground: "#f8fcff",
  card: "#ffffff",
  /** `--foreground`, the navy used for every heading. */
  heading: "#243b53",
  /** `--muted-foreground`, body copy. */
  body: "#52667a",
  /** `--primary`, the violet every primary CTA uses. */
  primary: "#8b5cf6",
  /** `--secondary-foreground`, for violet text on a light violet fill. */
  primaryDark: "#6d28d9",
  /** `--secondary`, the light violet fill behind highlighted blocks. */
  primarySoft: "#ede9fe",
  border: "#e3ecf5",
  /**
   * A touch deeper than `pageBackground`. They were the same value at
   * first, which made the footer band invisible against the page — the
   * copyright line floated below the card instead of sitting in a footer.
   */
  footerBackground: "#eef5fc",
  footerText: "#6c7f95",
} as const;

/** The approved campaign banner, used as the header of both emails. */
const BANNER_PATH = "/campaign/banners/banner-campaign.jpg";

/**
 * The banner needs an absolute `https://` URL: a mail client has no
 * origin to resolve `/campaign/...` against. `buildAppUrl` is the app's
 * single source for that base (`NEXT_PUBLIC_APP_URL`), already used for
 * the resume link, so the domain is never written down twice.
 */
export function bannerUrl(): string {
  return buildAppUrl(BANNER_PATH);
}

/**
 * Escapes a value for interpolation into HTML.
 *
 * Every dynamic value in these templates is a parent's own input
 * (`parentName`, `babyName`) or a URL built from it. `sanitizePlainText`
 * already rejects `<` and `>` at the API boundary, so this is not the
 * only line of defence — but it is the one that lives next to the
 * interpolation, and it is what makes an ampersand in "Ana & Luis"
 * render as an ampersand instead of a broken entity.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A primary (filled) or secondary (outlined) call to action. */
export function renderButton(options: {
  href: string;
  label: string;
  variant: "primary" | "secondary";
  /** `true` adds the `download` attribute, for a direct file link. */
  download?: boolean;
}): string {
  const isPrimary = options.variant === "primary";
  const background = isPrimary ? EMAIL_PALETTE.primary : EMAIL_PALETTE.card;
  const color = isPrimary ? "#ffffff" : EMAIL_PALETTE.primaryDark;
  const border = isPrimary ? EMAIL_PALETTE.primary : EMAIL_PALETTE.primaryDark;

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
  <tr>
    <td align="center" style="border-radius:10px;background-color:${background};border:2px solid ${border};">
      <a href="${escapeHtml(options.href)}"${options.download ? " download" : ""} style="display:block;padding:15px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;font-weight:bold;color:${color};text-decoration:none;">${options.label}</a>
    </td>
  </tr>
</table>`;
}

/**
 * Wraps a body in the shared shell: light page background, white card,
 * banner header, footer.
 *
 * `preheader` is the grey line of text a client shows next to the
 * subject in the inbox list. Left out, clients invent one from whatever
 * text comes first — which, with a banner at the top, is usually the
 * `alt` attribute.
 */
export function renderDocument(options: {
  title: string;
  preheader: string;
  contentHtml: string;
  campaignName: string;
}): string {
  const banner = escapeHtml(bannerUrl());
  const campaignName = escapeHtml(options.campaignName);

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeHtml(options.title)}</title>
  </head>
  <body style="margin:0;padding:0;width:100%;background-color:${EMAIL_PALETTE.pageBackground};font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${EMAIL_PALETTE.pageBackground};">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${EMAIL_PALETTE.card};border:1px solid ${EMAIL_PALETTE.border};border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:0;font-size:0;line-height:0;">
                <img src="${banner}" width="600" alt="${campaignName} — canciones personalizadas para tu bebé" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px;">
${options.contentHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px;background-color:${EMAIL_PALETTE.footerBackground};border-top:1px solid ${EMAIL_PALETTE.border};text-align:center;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:${EMAIL_PALETTE.footerText};">
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

/** The "¿Necesitas ayuda?" block both emails close their body with. */
export function renderSupport(supportEmail: string): string {
  const safe = escapeHtml(supportEmail);

  return `<p style="margin:28px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:${EMAIL_PALETTE.body};text-align:center;">
  ¿Necesitas ayuda?<br />
  Escríbenos a <a href="mailto:${safe}" style="color:${EMAIL_PALETTE.primaryDark};font-weight:bold;">${safe}</a>.
</p>`;
}
