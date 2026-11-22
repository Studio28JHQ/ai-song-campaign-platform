import "dotenv/config";
import { describe, expect, it, vi } from "vitest";
import {
  OPERATIONAL_ALERT_KINDS,
  type OperationalAlert,
} from "@/application/alerting/contracts/OperationalAlert";
import { appConfig } from "@/config/app";
import { OperationalAlertEmailTemplate } from "@/infrastructure/email/OperationalAlertEmailTemplate";
import type { ResendClient } from "@/infrastructure/email/ResendClient";
import { ResendEmailService } from "@/infrastructure/email/ResendEmailService";

const alert: OperationalAlert = {
  kind: OPERATIONAL_ALERT_KINDS.lyricsProviderCreditExhausted,
  summary: "Anthropic está rechazando las peticiones por facturación.",
  action: "Recarga el saldo en console.anthropic.com.",
  details: { estadoHttp: 400, minutosDesdeLaUltimaCompletada: null },
};

describe("OperationalAlertEmailTemplate", () => {
  it("puts the greppable kind in the subject, alongside the campaign name", () => {
    const subject = OperationalAlertEmailTemplate.subject(alert);

    expect(subject).toContain("[Alerta]");
    expect(subject).toContain("LYRICS_PROVIDER_CREDIT_EXHAUSTED");
    expect(subject).toContain(appConfig.campaign.name);
  });

  it("renders the summary, the action and every detail, with a null as a dash", () => {
    const html = OperationalAlertEmailTemplate.html(alert, new Date("2026-11-22T15:00:00.000Z"));

    expect(html).toContain("Anthropic está rechazando las peticiones por facturación.");
    expect(html).toContain("Recarga el saldo en console.anthropic.com.");
    expect(html).toContain("estadoHttp");
    expect(html).toContain("400");
    expect(html).toContain("—");
  });

  it("stamps the time in the campaign's timezone, not UTC", () => {
    // 15:00 UTC is 10:00 in Ecuador. An operator comparing this against
    // the panel must not have to convert.
    const html = OperationalAlertEmailTemplate.html(alert, new Date("2026-11-22T15:00:00.000Z"));

    expect(html).toContain("America/Guayaquil");
    expect(html).toMatch(/10:00:00/);
  });

  it("escapes a detail value instead of letting it become markup", () => {
    const html = OperationalAlertEmailTemplate.html({
      ...alert,
      details: { error: "<script>alert(1)</script>" },
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("ResendEmailService.sendAlertEmail", () => {
  it("sends only to the configured alert recipient, from the verified campaign sender", async () => {
    const client = { send: vi.fn().mockResolvedValue(undefined) } as unknown as ResendClient;

    await new ResendEmailService(client).sendAlertEmail(alert);

    expect(client.send).toHaveBeenCalledTimes(1);
    const payload = (client.send as ReturnType<typeof vi.fn>).mock.calls[0][0];

    expect(payload.to).toBe(appConfig.alerts.recipient);
    expect(payload.from).toBe(appConfig.resend.fromAddress);
  });

  /**
   * The recipient comes from the environment and is never written in
   * source: an address in a committed file is an address that ships in
   * every build. This asserts the *mechanism*, not the value — pinning the
   * value here would put it back in the repository through the test.
   */
  it("takes the recipient from the environment, and sends to exactly one address", () => {
    expect(appConfig.alerts.recipient).toBe(process.env.ALERT_EMAIL_TO);
    expect(typeof appConfig.alerts.recipient).toBe("string");
  });

  it("refuses to send, loudly, when no recipient is configured", async () => {
    const client = { send: vi.fn().mockResolvedValue(undefined) } as unknown as ResendClient;

    // `appConfig` is a plain frozen-by-convention object, not a module
    // getter, so the unset case is reproduced by swapping the one field
    // back and forth rather than by mocking the whole config module —
    // which `vi.mock` would hoist over every other test in this file.
    const slot = appConfig.alerts as { recipient?: string };
    const configured = slot.recipient;
    slot.recipient = undefined;

    try {
      await expect(new ResendEmailService(client).sendAlertEmail(alert)).rejects.toThrow(
        /ALERT_EMAIL_TO is not configured/,
      );
      // Never sent somewhere else, and never silently dropped.
      expect(client.send).not.toHaveBeenCalled();
    } finally {
      slot.recipient = configured;
    }
  });
});
