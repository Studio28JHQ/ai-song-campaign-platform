import { describe, expect, it } from "vitest";
import { OPERATIONAL_ALERT_KINDS } from "@/application/alerting/contracts/OperationalAlert";
import { toClaudeOperationalAlert } from "@/infrastructure/ai/claude/claudeAlert";
import { ExternalApiError } from "@/shared/errors";

/**
 * Operational Alerting. The distinction this file exists for: telling "we
 * ran out of money" apart from "Anthropic is having a bad day", when both
 * arrive as the same HTTP 400.
 *
 * The payloads below are the real shapes — an exhausted credit balance is
 * an `invalid_request_error`, not the documented 402 `billing_error`, and
 * on 2026-11-21 that produced 530 failures that the database could only
 * record as "status 400".
 */

const claudeError = (status: number, details: unknown) =>
  new ExternalApiError(`Claude API responded with status ${status}.`, {
    code: "claude.api_error",
    context: { status, details },
  });

describe("toClaudeOperationalAlert", () => {
  it("recognises an exhausted credit balance behind a 400", () => {
    const alert = toClaudeOperationalAlert(
      claudeError(400, {
        type: "error",
        error: {
          type: "invalid_request_error",
          message:
            "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
        },
      }),
      "anthropic",
    );

    expect(alert.kind).toBe(OPERATIONAL_ALERT_KINDS.lyricsProviderCreditExhausted);
    expect(alert.action).toContain("Plans & Billing");
    expect(alert.details).toMatchObject({ estadoHttp: 400, codigoInterno: "claude.api_error" });
  });

  it("trusts a documented 402 on its status alone", () => {
    const alert = toClaudeOperationalAlert(claudeError(402, null), "anthropic");

    expect(alert.kind).toBe(OPERATIONAL_ALERT_KINDS.lyricsProviderCreditExhausted);
  });

  it("recognises a spend-cap 429", () => {
    const alert = toClaudeOperationalAlert(
      claudeError(429, {
        error: { type: "rate_limit_error", message: "You have exceeded your monthly spend limit." },
      }),
      "anthropic_rate_limited",
    );

    expect(alert.kind).toBe(OPERATIONAL_ALERT_KINDS.lyricsProviderCreditExhausted);
  });

  it("does not read a genuine malformed-request 400 as a billing problem", () => {
    const alert = toClaudeOperationalAlert(
      claudeError(400, {
        error: {
          type: "invalid_request_error",
          message: 'messages: roles must alternate between "user" and "assistant"',
        },
      }),
      "anthropic",
    );

    expect(alert.kind).toBe(OPERATIONAL_ALERT_KINDS.lyricsProviderUnavailable);
  });

  it("falls back to the generic kind for an outage, a throttle and a timeout", () => {
    expect(toClaudeOperationalAlert(claudeError(529, null), "anthropic").kind).toBe(
      OPERATIONAL_ALERT_KINDS.lyricsProviderUnavailable,
    );
    expect(
      toClaudeOperationalAlert(
        claudeError(429, { error: { message: "Number of requests has exceeded your rate limit" } }),
        "anthropic_rate_limited",
      ).kind,
    ).toBe(OPERATIONAL_ALERT_KINDS.lyricsProviderUnavailable);
    expect(
      toClaudeOperationalAlert(
        new ExternalApiError("Request failed", { code: "http_request_failed" }),
        "timeout",
      ).kind,
    ).toBe(OPERATIONAL_ALERT_KINDS.lyricsProviderUnavailable);
  });

  it("never carries anything from the parent's request into the email", () => {
    const alert = toClaudeOperationalAlert(
      claudeError(500, { error: { message: "oops" } }),
      "anthropic",
    );
    const serialised = JSON.stringify(alert);

    // Only a status, our own code and the classification may appear.
    expect(Object.keys(alert.details ?? {}).sort()).toEqual([
      "clasificacion",
      "codigoInterno",
      "estadoHttp",
      "proveedor",
    ]);
    expect(serialised).not.toContain("oops");
  });
});
