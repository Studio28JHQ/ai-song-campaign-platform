import {
  OPERATIONAL_ALERT_KINDS,
  type OperationalAlert,
} from "@/application/alerting/contracts/OperationalAlert";
import { AppError, ExternalApiError } from "@/shared/errors";

/**
 * Operational Alerting. Turns a Claude failure into the alert that should
 * be emailed about it.
 *
 * This lives in the Claude adapter because recognising a billing refusal
 * means knowing what Anthropic's own error payloads look like, which is
 * exactly the knowledge this layer exists to contain. The application
 * layer stays free of provider shapes.
 *
 * ## Why the billing case is matched on the message
 *
 * The documented code for a billing problem is HTTP 402 `billing_error`,
 * and a monthly spend cap arrives as a 429. But an exhausted *credit
 * balance* — the condition that actually took this campaign down twice,
 * on 2026-11-11 and again on 2026-11-21 — arrives as a plain **HTTP 400
 * `invalid_request_error`** whose message says the credit balance is too
 * low. All 530 failures of the second incident recorded
 * `Claude API responded with status 400.` and nothing else, which is
 * indistinguishable from a genuine malformed request until the body is
 * read.
 *
 * So: 402 is trusted on its status alone, and 400/429 are promoted to the
 * billing kind only when the payload says so. Matching on provider prose
 * is brittle by nature, and that is handled by degrading rather than
 * guessing — an unmatched failure is still alerted, just as the generic
 * `LYRICS_PROVIDER_UNAVAILABLE`. A reworded Anthropic message costs a
 * precise subject line, never a missed alert.
 */

/** HTTP statuses that can carry a billing refusal. */
const BILLING_STATUS = 402;
const AMBIGUOUS_BILLING_STATUSES: ReadonlySet<number> = new Set([400, 429]);

/**
 * Lowercased fragments that appear in Anthropic's billing refusals.
 * Matched against the serialised error payload, never against our own
 * message.
 */
const BILLING_MESSAGE_FRAGMENTS = [
  "credit balance",
  "billing",
  "plans & billing",
  "purchase credits",
  "spend limit",
  "spending limit",
  "quota",
] as const;

function statusOf(error: unknown): number | null {
  if (!(error instanceof AppError)) return null;
  const status = error.context?.status;
  return typeof status === "number" ? status : null;
}

/** The provider's own payload, flattened to lowercase text for matching. */
function payloadText(error: unknown): string {
  if (!(error instanceof AppError)) return "";
  const details = error.context?.details;
  if (details === undefined || details === null) return "";

  try {
    return JSON.stringify(details).toLowerCase();
  } catch {
    return "";
  }
}

function looksLikeBillingRefusal(error: unknown): boolean {
  const status = statusOf(error);
  if (status === BILLING_STATUS) return true;
  if (status === null || !AMBIGUOUS_BILLING_STATUSES.has(status)) return false;

  const text = payloadText(error);
  return BILLING_MESSAGE_FRAGMENTS.some((fragment) => text.includes(fragment));
}

/**
 * Builds the alert for a failure thrown out of the lyrics generation
 * path. `source` is the classification the route already computed for its
 * own logs (`timeout`, `anthropic_rate_limited`, `anthropic`, …), passed
 * in rather than recomputed so the email and the log line can never
 * disagree about what happened.
 *
 * Nothing from the parent's request reaches the returned alert: only a
 * status code, our own error code, and that classification.
 */
export function toClaudeOperationalAlert(error: unknown, source: string): OperationalAlert {
  const status = statusOf(error);
  const code = error instanceof AppError ? error.code : null;

  if (looksLikeBillingRefusal(error)) {
    return {
      kind: OPERATIONAL_ALERT_KINDS.lyricsProviderCreditExhausted,
      summary:
        "Anthropic (Claude) está rechazando las peticiones por un motivo de facturación: saldo agotado o tope de gasto alcanzado. Ninguna familia puede generar letras.",
      action:
        "Recarga el saldo en console.anthropic.com (Plans & Billing) o sube el tope de gasto. En cuanto haya saldo el servicio se restablece solo, sin desplegar nada. Las familias que fallaron conservan sus 3 intentos.",
      details: {
        proveedor: "Anthropic (Claude)",
        estadoHttp: status,
        codigoInterno: code,
        clasificacion: source,
      },
    };
  }

  return {
    kind: OPERATIONAL_ALERT_KINDS.lyricsProviderUnavailable,
    summary:
      "La generación de letras está fallando: Claude no está devolviendo respuestas utilizables y las familias reciben el error temporal.",
    action:
      "Revisa status.anthropic.com y la línea 'Anthropic API returned an error response' en los logs de Vercel, que incluye el request id. Las familias no pierden intentos por un fallo del proveedor.",
    details: {
      proveedor: "Anthropic (Claude)",
      estadoHttp: status,
      codigoInterno: code,
      clasificacion: source,
    },
  };
}

/** Narrow helper so a route can alert only on genuine provider failures. */
export function isClaudeProviderFailure(error: unknown): boolean {
  return error instanceof ExternalApiError;
}
