import type { RateLimiter } from "@/application/security/services/RateLimiter";
import { logger } from "@/shared/logger/logger";
import type { AlertEmailSender } from "../contracts/AlertEmailSender";
import type { OperationalAlert, OperationalAlertKind } from "../contracts/OperationalAlert";

/**
 * Operational Alerting. How long one kind of alert stays silent after it
 * has been emailed once.
 *
 * This number is the whole reason the service exists rather than a bare
 * `sendAlertEmail` call at each detection site. The 2026-11-21 Claude
 * billing outage produced 530 identical failures in five hours, and the
 * pipeline tick runs on a schedule, so an unthrottled alert on a stalled
 * queue would send one email per tick for as long as the problem lasts.
 * One per hour per kind turns both of those into roughly five emails that
 * get read, instead of hundreds that get filtered.
 *
 * Per *kind*, not per occurrence: during an outage every failure says the
 * same thing, and the first one already said it.
 */
const ALERT_THROTTLE_MINUTES = 60;

/**
 * Operational Alerting. The single way anything in this application
 * reports that the platform has a problem.
 *
 * Two guarantees, both of which matter more than the alert itself:
 *
 * 1. **It never throws and never rejects.** Every call site is already on
 *    a failure path — a route handler about to return a 503, the `catch`
 *    of the pipeline tick. An alerting failure there must not replace the
 *    real error with a worse one, so everything here is swallowed and
 *    logged. A monitoring feature that can take the thing it monitors
 *    down is a liability.
 * 2. **It is throttled.** See `ALERT_THROTTLE_MINUTES`.
 *
 * The throttle reuses `RateLimiter` exactly as the registration and
 * generation limits do — `limit: 1` over the window is a cooldown, and
 * the limiter already records the event only when it allows the call, so
 * a suppressed alert cannot extend its own silence. No new table, no
 * migration, no second mechanism that means the same thing.
 */
export class OperationalAlertService {
  constructor(
    private readonly emailSender: AlertEmailSender,
    private readonly rateLimiter: RateLimiter,
  ) {}

  /**
   * Reports a problem. Resolves whether or not an email was sent, and
   * resolves even when sending failed — the boolean is for tests and for
   * the pipeline tick's response body, never for control flow at a
   * detection site.
   */
  async raise(alert: OperationalAlert): Promise<boolean> {
    try {
      const allowed = await this.rateLimiter.consume({
        key: OperationalAlertService.throttleKey(alert.kind),
        limit: 1,
        windowMinutes: ALERT_THROTTLE_MINUTES,
      });

      if (!allowed.allowed) {
        logger.info("Operational alert suppressed by its cooldown", {
          kind: alert.kind,
          throttleMinutes: ALERT_THROTTLE_MINUTES,
        });
        return false;
      }

      await this.emailSender.sendAlertEmail(alert);

      logger.error("Operational alert emailed", {
        kind: alert.kind,
        summary: alert.summary,
        ...(alert.details ?? {}),
      });

      return true;
    } catch (error) {
      // Deliberately terminal. See guarantee 1 in the class doc.
      logger.error("Could not deliver an operational alert", {
        kind: alert.kind,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Namespaced so an alert cooldown can never collide with a security
   * rate limit in the shared `rate_limit_events` table.
   */
  private static throttleKey(kind: OperationalAlertKind): string {
    return `alert:${kind}`;
  }
}
