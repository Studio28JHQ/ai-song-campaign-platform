import { appConfig } from "@/config/app";
import { ExternalApiError } from "@/shared/errors";
import { httpRequest } from "@/shared/http";
import type { ResendEmailPayload } from "./types";

const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_DOMAINS_URL = "https://api.resend.com/domains";

/**
 * Minimal HTTP client for Resend's transactional email API, built on the
 * shared `httpRequest` helper (`src/shared/http/`) rather than the
 * official SDK, consistent with the Claude/Mureka integrations and the
 * project's "no unnecessary abstractions" principle. Adds a bearer token
 * (from `appConfig.resend.apiKey`).
 */
export class ResendClient {
  async send(payload: ResendEmailPayload): Promise<void> {
    const response = await httpRequest(RESEND_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${appConfig.resend.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const details = await response.json().catch(() => null);
      throw new ExternalApiError(`Resend API responded with status ${response.status}.`, {
        code: "resend.api_error",
        context: { status: response.status, details },
      });
    }
  }

  /**
   * Checks connectivity/authentication against Resend without sending
   * anything (RC-2 — Production Hardening). `GET /domains` is Resend's
   * own lightweight read endpoint — used only by
   * `GET /api/internal/health`, never in the email-delivery path
   * itself.
   */
  async checkHealth(): Promise<void> {
    const response = await httpRequest(RESEND_DOMAINS_URL, {
      method: "GET",
      headers: {
        authorization: `Bearer ${appConfig.resend.apiKey}`,
      },
    });

    if (!response.ok) {
      const details = await response.json().catch(() => null);
      throw new ExternalApiError(`Resend API responded with status ${response.status}.`, {
        code: "resend.api_error",
        context: { status: response.status, details },
      });
    }
  }
}
