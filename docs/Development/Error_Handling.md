# Error Handling

## Philosophy

Errors are handled at the layer that understands them. The domain and application layers surface typed, expected errors; infrastructure translates external failures into those same types; the presentation layer never exposes internal details to the user.

## Expected Errors

Errors that are a normal part of the business flow (e.g. duplicate email, attempts exhausted, moderation rejection, invalid input). These are modeled explicitly in the application/domain layer and surfaced to the user as clear, actionable messages.

## Unexpected Errors

Errors that indicate a bug or an unhandled condition (e.g. null reference, programming error). These are caught at a boundary (Route Handler), logged with full detail, and shown to the user as a generic, friendly failure message — never as a stack trace or raw error.

## External API Failures

Claude, Mureka, and Resend calls can fail or time out. Each integration:

- Catches and classifies failures (timeout, rate limit, invalid response, service error).
- Retries transient failures according to the policy in `docs/Architecture/External_Services.md`.
- Never lets a raw provider error reach the user; it is translated into a domain-level failure (e.g. "lyrics generation failed, please try again").
- Does not consume a lyric attempt when the failure is on the provider/infrastructure side rather than a user action (see `docs/Product/Business_Rules.md`).

## Database Failures

Repository implementations catch persistence errors (connection issues, constraint violations) and translate them into application-level errors. Constraint violations that reflect business rules (e.g. duplicate email) are translated into the corresponding expected/domain error rather than a generic failure.

## Validation Failures

Input validation happens before any AI call is made (see `docs/Product/User_Flow.md` — Local Validation). Validation failures are returned immediately with field-level, user-friendly messages and never consume a lyric attempt.

## User-Friendly Messages

- Users only ever see clear, actionable messages (e.g. "This email has already been used", "Please revise your message and try again", "Something went wrong, please try again").
- Internal error codes, stack traces, provider error payloads, and infrastructure details are never shown to the user.

## Logging Strategy

- All unexpected errors and external API failures are logged server-side with enough context to diagnose (operation, identifiers, error detail) without logging sensitive personal data unnecessarily.
- Expected/business errors (e.g. moderation rejection) may be logged at a lower severity for campaign monitoring, distinct from unexpected errors.
- Logging depth stays proportional to the campaign's scale — no dedicated observability stack beyond what Vercel/Supabase provide by default (see `BACKLOG_V3.md` for advanced observability).

## Hard Rule

Never expose internal errors to users.
