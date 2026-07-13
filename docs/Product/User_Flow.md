# User Flow

## Happy Path

Landing Page

↓

Lead Registration

↓

Unique Email Validation

↓

Song Personalization

↓

Local Validation

↓

Claude Moderation

↓

Lyrics Generation

↓

Lyrics Preview

↓

Accept Lyrics
OR
Generate Again

↓

Suno Song Generation

↓

Store Audio

↓

Send Email

↓

Campaign Finished

## Step Descriptions

**Landing Page** — Visitor arrives at the campaign page and learns about the offer.

**Lead Registration** — Visitor submits their email and basic details to start.

**Unique Email Validation** — System checks the email has not already generated a final song.

**Song Personalization** — User provides personalization inputs (e.g. baby's name, mood selection among the four predefined moods).

**Local Validation** — Client/server-side validation of input format, required fields, and length constraints before any AI call is made.

**Claude Moderation** — Personalization inputs are checked for inappropriate content before lyrics are generated.

**Lyrics Generation** — Claude generates personalized lyrics based on validated, moderated input.

**Lyrics Preview** — User reviews the generated lyrics.

**Accept Lyrics / Generate Again** — User either approves the lyrics to proceed, or requests regeneration (consuming an attempt).

**Suno Song Generation** — Approved lyrics and the selected mood's fixed prompt are sent to Suno to generate the final audio.

**Store Audio** — The generated audio file is stored in Supabase Storage.

**Send Email** — The final song is emailed to the user via Resend.

**Campaign Finished** — The user's journey is complete; no further songs can be generated for that email.

## Lead Registration Endpoint

`POST /api/leads` implements the **Lead Registration** step of the happy path above. It is the first public API of the application — there is no Landing Page UI calling it yet.

**Request body:**

| Field        | Required | Notes                                  |
| ------------ | -------- | -------------------------------------- |
| `campaignId` | yes      | Which campaign the lead registers for. |
| `parentName` | yes      |                                        |
| `babyName`   | yes      |                                        |
| `babyAge`    | no       | In months.                             |
| `city`       | no       |                                        |
| `email`      | yes      | Must be unique across all leads.       |
| `phone`      | no       |                                        |

**Success — `201 Created`:**

```json
{ "leadId": "...", "remainingAttempts": 5, "status": "REGISTERED" }
```

Only these three fields are returned — no internal identifiers (campaign ID, timestamps, etc.) or persistence details are exposed.

**Errors:**

| Status | When                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------- |
| `400`  | The request body is malformed, missing a required field, or fails domain-level validation (e.g. an invalid email format). |
| `409`  | The email has already been used to register a lead (see `docs/Product/Business_Rules.md` — Email Rules).                  |
| `422`  | Any other business rule violation.                                                                                        |
| `500`  | An unexpected/infrastructure error. The response never includes a stack trace or a raw database error.                    |

The endpoint only validates input and maps the result of `CreateLeadUseCase` to an HTTP response — email uniqueness and every other business rule are enforced by the Application and Domain layers, not by the endpoint itself.

## Failure Scenarios

- **Duplicate email**: Registration is rejected because the email has already generated a final song.
- **Invalid input format**: Local validation rejects personalization input before any AI call (e.g. missing name, invalid characters, exceeding length limits).
- **Moderation rejection**: Claude moderation flags the input as inappropriate; an attempt is consumed and the user is asked to revise their input.
- **Attempts exhausted**: User has used all five lyric attempts (via regenerations and/or moderation rejections) without accepting lyrics; the flow ends without a song.
- **Lyrics generation failure**: Claude API call fails or times out; user is shown an error and may retry without consuming an attempt.
- **Lyrics regeneration requested**: User rejects the previewed lyrics and requests a new version; an attempt is consumed.
- **Song generation failure**: Suno API call fails or times out; the system retries or surfaces an error without consuming a lyric attempt.
- **Audio storage failure**: Upload to Supabase Storage fails; the system retries before proceeding to email delivery.
- **Email delivery failure**: Resend fails to deliver the final email; the system retries or logs the failure for admin follow-up.
- **Campaign capacity reached**: The 3,000 song cap is reached; new registrations are declined or queued per campaign rules.
- **Campaign period ended**: The one-month campaign window has closed; the Landing Page no longer accepts new registrations.
