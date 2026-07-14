/** The request payload sent to Resend's email-sending endpoint. */
export interface ResendEmailPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
}
