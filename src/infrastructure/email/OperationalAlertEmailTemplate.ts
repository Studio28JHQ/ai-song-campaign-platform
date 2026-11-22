import type { OperationalAlert } from "@/application/alerting/contracts/OperationalAlert";
import { appConfig, buildAppUrl } from "@/config/app";
import { escapeHtml } from "./emailChrome";

/**
 * Operational Alerting. The alert email.
 *
 * Deliberately not built on `emailChrome`: that is the campaign's
 * identity — the banner, the violet CTA, the footer — and it belongs to
 * the two emails a *parent* receives. This one goes to one operator in
 * the middle of an incident, so it is a plain, high-contrast block that
 * says what broke, when, and what to do, and nothing that takes a second
 * scroll. It still escapes every interpolated value through the same
 * helper the campaign templates use.
 *
 * Times are rendered in the campaign's timezone, like every other date
 * the team reads (the Familias table, the Dashboard charts): an operator
 * comparing this against Vercel logs should not have to convert.
 */

const ALERT_TIME_ZONE = "America/Guayaquil";

const alertTimeFormatter = new Intl.DateTimeFormat("es-EC", {
  timeZone: ALERT_TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "medium",
});

const PALETTE = {
  page: "#f6f7f9",
  card: "#ffffff",
  heading: "#7f1d1d",
  headingBackground: "#fee2e2",
  body: "#1f2937",
  muted: "#6b7280",
  border: "#e5e7eb",
} as const;

export const OperationalAlertEmailTemplate = {
  /**
   * The kind is in the subject on purpose: it is the stable, greppable
   * token, so a mail client can filter or thread on it while the summary
   * stays human.
   */
  subject(alert: OperationalAlert): string {
    return `[Alerta] ${appConfig.campaign.name} — ${alert.kind}`;
  },

  html(alert: OperationalAlert, occurredAt: Date = new Date()): string {
    const rows = Object.entries(alert.details ?? {})
      .map(([key, value]) => {
        const rendered = value === null ? "—" : String(value);
        return `
              <tr>
                <td style="padding:6px 12px 6px 0;color:${PALETTE.muted};font-size:13px;vertical-align:top;white-space:nowrap;">${escapeHtml(key)}</td>
                <td style="padding:6px 0;color:${PALETTE.body};font-size:13px;font-weight:600;vertical-align:top;">${escapeHtml(rendered)}</td>
              </tr>`;
      })
      .join("");

    const detailsBlock = rows
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 20px;">${rows}
            </table>`
      : "";

    return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px 12px;background-color:${PALETTE.page};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;margin:0 auto;border-collapse:collapse;background-color:${PALETTE.card};border:1px solid ${PALETTE.border};border-radius:10px;">
      <tr>
        <td style="padding:14px 24px;background-color:${PALETTE.headingBackground};border-radius:10px 10px 0 0;">
          <p style="margin:0;color:${PALETTE.heading};font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Alerta de plataforma</p>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 4px;color:${PALETTE.muted};font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(alert.kind)}</p>
          <p style="margin:0 0 20px;color:${PALETTE.body};font-size:16px;line-height:1.5;font-weight:600;">${escapeHtml(alert.summary)}</p>
          ${detailsBlock}<p style="margin:0 0 6px;color:${PALETTE.muted};font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Qué hacer</p>
          <p style="margin:0 0 20px;color:${PALETTE.body};font-size:14px;line-height:1.6;">${escapeHtml(alert.action)}</p>
          <p style="margin:0;color:${PALETTE.muted};font-size:12px;line-height:1.6;">
            ${escapeHtml(alertTimeFormatter.format(occurredAt))} (${escapeHtml(ALERT_TIME_ZONE)})<br />
            <a href="${escapeHtml(buildAppUrl("/admin/dashboard"))}" style="color:${PALETTE.muted};">Panel de administración</a>
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 24px;border-top:1px solid ${PALETTE.border};color:${PALETTE.muted};font-size:11px;line-height:1.5;border-radius:0 0 10px 10px;">
          Mensaje automático. Cada tipo de alerta se envía una sola vez por hora, así que un incidente prolongado no llena tu bandeja.
        </td>
      </tr>
    </table>
  </body>
</html>`;
  },
};
