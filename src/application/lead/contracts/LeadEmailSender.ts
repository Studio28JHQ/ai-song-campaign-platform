/**
 * What sending the post-registration welcome email needs — nothing more.
 * Keeps the route handler decoupled from `@/infrastructure/email` (a
 * concrete Resend-backed adapter), same pattern as `SongEmailSender`.
 */
export interface WelcomeEmailInput {
  to: string;
  parentName: string;
  babyName: string;
  /** Full, absolute resume-journey URL — never a bare token or Lead id. */
  resumeUrl: string;
}

export interface LeadEmailSender {
  sendWelcomeEmail(input: WelcomeEmailInput): Promise<void>;
}
