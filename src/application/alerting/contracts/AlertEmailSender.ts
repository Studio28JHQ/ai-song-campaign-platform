/**
 * Operational Alerting. What sending one alert email needs — nothing
 * more. Keeps `OperationalAlertService` decoupled from
 * `@/infrastructure/email` (a concrete Resend-backed adapter), the same
 * pattern as `LeadEmailSender` and `SongEmailSender`.
 *
 * There is no `to`: the recipient is operational configuration
 * (`appConfig.alerts.recipient`), resolved by the adapter, not chosen per
 * call. A detection site deep in the code has no business deciding who
 * gets told, and an alert must never be addressable from anything a
 * request carries.
 */
import type { OperationalAlert } from "./OperationalAlert";

export interface AlertEmailSender {
  sendAlertEmail(alert: OperationalAlert): Promise<void>;
}
