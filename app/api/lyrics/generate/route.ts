import { NextResponse } from "next/server";
import { z } from "zod";
import { GenerateLyricsForLeadUseCase } from "@/application/lyrics/use-cases/GenerateLyricsForLeadUseCase";
import { RateLimiter } from "@/application/security/services/RateLimiter";
import { SecurityEventRecorder } from "@/application/security/services/SecurityEventRecorder";
import { appConfig } from "@/config/app";
import { VOICE_OPTIONS } from "@/domain/lyrics/types";
import { ClaudeLyricsService } from "@/infrastructure/ai/claude/ClaudeLyricsService";
import { getLeadSession } from "@/infrastructure/auth/getLeadSession";
import { getClientIp } from "@/infrastructure/http/getClientIp";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { PrismaLeadRepository } from "@/infrastructure/persistence/prisma/lead/PrismaLeadRepository";
import { PrismaLyricsRepository } from "@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository";
import { PrismaRateLimitRepository } from "@/infrastructure/persistence/prisma/security/PrismaRateLimitRepository";
import { TurnstileClient } from "@/infrastructure/security/turnstile/TurnstileClient";
import { TurnstileVerifier } from "@/infrastructure/security/turnstile/TurnstileVerifier";
import {
  AppError,
  BusinessRuleError,
  DatabaseError,
  ExternalApiError,
  ValidationError,
} from "@/shared/errors";
import { logger } from "@/shared/logger/logger";
import { FIELD_LIMITS } from "@/shared/validation/text";
import { plainTextField } from "@/shared/validation/zodFields";

/**
 * POST /api/lyrics/generate — generates (or regenerates) lyrics for a
 * lead. This file only validates input, invokes
 * `GenerateLyricsForLeadUseCase`, and maps the result/errors to an HTTP
 * response. No business rule (attempt consumption, moderation, lead
 * validation) is evaluated here — those live in the Application and
 * Domain layers.
 *
 * The Lead is identified only via the session cookie (see
 * `getLeadSession`) — the request body never carries a Lead id.
 *
 * Turnstile is required only for a lead's first lyrics generation — the
 * one public-entry-point action a session alone doesn't yet vouch for.
 * "Is this a regeneration?" is derived the same way
 * `GenerateLyricsForLeadUseCase` already derives it for attempt
 * consumption — whether the lead already has any Lyrics versions, never
 * from client input — so a "Generate another version" call (which has
 * no Turnstile widget on screen at all, see `LyricsReviewPanel`) relies
 * exclusively on the already-authenticated session instead of a
 * necessarily-stale, already-consumed token. This never weakens lead
 * creation's own Turnstile requirement (`POST /api/leads`, untouched)
 * or the first-generation requirement below, and every generation call
 * — first or repeated — still passes through the unchanged per-lead and
 * per-IP rate limiters.
 */

const lyricsRepository = new PrismaLyricsRepository();
const generateLyricsUseCase = new GenerateLyricsForLeadUseCase(
  new PrismaLeadRepository(),
  lyricsRepository,
  new ClaudeLyricsService(),
);
const rateLimiter = new RateLimiter(new PrismaRateLimitRepository());
const securityEventRecorder = new SecurityEventRecorder(new PrismaAuditLogRepository());
const turnstileVerifier = new TurnstileVerifier(new TurnstileClient());

// Structural validation (shape/type/presence) plus the shared Sprint 8.1
// input-hardening rules for `parentMessage` (trim, collapse whitespace,
// Unicode normalization, control-character/HTML/length limits — see
// `@/shared/validation`). Whether the lead exists, has remaining
// attempts, and whether the content is approved are Application/Domain-
// layer concerns, never duplicated here.
const generateLyricsRequestSchema = z
  .object({
    moodId: z.string().min(1),
    moodName: z.string().min(1),
    moodDescription: z.string().min(1).optional(),
    parentMessage: plainTextField("Your message", FIELD_LIMITS.lyricsMessage),
    // Required only for a lead's first lyrics generation — see the
    // route's own doc comment above. Optional here at the schema level
    // because whether it's actually required can only be known once the
    // lead's existing Lyrics versions have been checked, below.
    turnstileToken: z.string().min(1).optional(),
    // Sprint v1.1 — AI Musical Direction. Optional with a default so an
    // older client that doesn't send it yet still works unchanged.
    voice: z.enum(VOICE_OPTIONS).default("FEMALE"),
  })
  .strict();

export async function POST(request: Request): Promise<NextResponse> {
  const leadId = await getLeadSession();
  if (!leadId) {
    return errorResponse(401, "no_session", "No active session.");
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "The request body must be valid JSON.");
  }

  const parsed = generateLyricsRequestSchema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "The request payload is invalid.";
    return errorResponse(400, "invalid_request", message);
  }

  const ip = getClientIp(request);

  const sessionLimit = await rateLimiter.consume({
    key: `lyrics_generation:lead:${leadId}`,
    limit: appConfig.security.rateLimit.maxGenerationsPerHour,
    windowMinutes: appConfig.security.rateLimit.windowMinutes,
  });
  if (!sessionLimit.allowed) {
    await securityEventRecorder.record({
      action: "excessive_generation_attempts",
      entity: "Lead",
      entityId: leadId,
      metadata: { scope: "lyrics_generation" },
    });
    return tooManyRequestsResponse();
  }

  const ipLimit = await rateLimiter.consume({
    key: `lyrics_generation:ip:${ip}`,
    limit: appConfig.security.rateLimit.maxGenerationsPerIpPerHour,
    windowMinutes: appConfig.security.rateLimit.windowMinutes,
  });
  if (!ipLimit.allowed) {
    await securityEventRecorder.record({
      action: "rate_limit_exceeded",
      entity: "IpAddress",
      metadata: { ip, scope: "lyrics_generation" },
    });
    return tooManyRequestsResponse();
  }

  // Same signal `GenerateLyricsForLeadUseCase` already uses to decide
  // attempt consumption — never client input. A lead with no existing
  // Lyrics versions yet is generating for the first time and still
  // needs Turnstile; any later call is a regeneration and relies on the
  // session established by `getLeadSession` above instead (see this
  // route's doc comment).
  const existingVersions = await lyricsRepository.findAllByLead(leadId);
  const isRegeneration = existingVersions.length > 0;

  if (!isRegeneration) {
    if (!parsed.data.turnstileToken) {
      return errorResponse(400, "invalid_request", "Human verification is required.");
    }

    try {
      const verification = await turnstileVerifier.verify(parsed.data.turnstileToken, ip);
      if (!verification.success) {
        await securityEventRecorder.record({
          action: "invalid_turnstile_token",
          entity: "Lead",
          entityId: leadId,
          metadata: { ip, scope: "lyrics_generation", errorCodes: verification.errorCodes },
        });

        if (turnstileVerifier.isExpiredOrAlreadyUsed(verification)) {
          return errorResponse(
            403,
            "turnstile_expired_or_reused",
            "Your verification expired or was already used. Please verify again.",
          );
        }

        return errorResponse(
          403,
          "human_verification_failed",
          "We couldn't verify you're not a robot. Please try again.",
        );
      }
    } catch (error) {
      return handleTurnstileError(error);
    }
  }

  try {
    const result = await generateLyricsUseCase.execute({ leadId, ...parsed.data });

    // A moderation rejection is a normal, expected outcome (see
    // docs/Product/Business_Rules.md) — the request itself succeeded, so
    // this stays a 200 with `approved: false`, not an HTTP error.
    return NextResponse.json(
      {
        lyrics: result.lyrics,
        approved: result.approved,
        reason: result.reason,
        remainingAttempts: result.remainingAttempts,
        leadStatus: result.leadStatus,
      },
      { status: 200 },
    );
  } catch (error) {
    return handleUseCaseError(error);
  }
}

function handleUseCaseError(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return errorResponse(400, "invalid_request", error.message);
  }

  if (error instanceof BusinessRuleError) {
    if (error.code === "lyrics.lead_not_found") {
      return errorResponse(404, "lead_not_found", error.message);
    }

    if (error.code === "lyrics.no_remaining_attempts") {
      return errorResponse(422, "no_remaining_attempts", error.message);
    }

    if (error.code === "lyrics.already_approved") {
      return errorResponse(422, "lyrics_already_approved", error.message);
    }

    return errorResponse(422, "business_rule_violation", error.message);
  }

  if (error instanceof DatabaseError) {
    logDiagnostics("Database error while generating lyrics", error, { source: "prisma" });
    return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
  }

  if (error instanceof ExternalApiError) {
    logDiagnostics("Claude API failure while generating lyrics", error, {
      source: classifyExternalApiError(error),
    });

    return errorResponse(
      503,
      "claude_unavailable",
      "The lyrics generation service is temporarily unavailable. Please try again shortly.",
    );
  }

  logDiagnostics("Unexpected error while generating lyrics", error, { source: "unexpected" });

  return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
}

function handleTurnstileError(error: unknown): NextResponse {
  if (error instanceof ExternalApiError) {
    logDiagnostics("Turnstile verification failed", error, { source: "turnstile" });

    return errorResponse(
      503,
      "verification_unavailable",
      "Verification is temporarily unavailable. Please try again shortly.",
    );
  }

  logDiagnostics("Unexpected error while verifying Turnstile token", error, {
    source: "unexpected",
  });

  return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
}

/**
 * Best-effort classification of an `ExternalApiError` thrown while calling
 * Claude, purely to make server logs immediately actionable (see the
 * investigation checklist this endpoint's diagnostics were hardened
 * against: Turnstile vs Anthropic vs a timeout vs Anthropic's own rate
 * limiting). Never affects the response sent to the client.
 */
function classifyExternalApiError(error: ExternalApiError): string {
  const cause = error.cause;
  const isTimeout =
    (cause instanceof Error && cause.name === "AbortError") ||
    (cause instanceof AppError &&
      cause.cause instanceof Error &&
      cause.cause.name === "AbortError");

  if (isTimeout) {
    return "timeout";
  }

  const status = error.context?.status;
  if (status === 429) {
    return "anthropic_rate_limited";
  }

  if (error.code.startsWith("claude.")) {
    return "anthropic";
  }

  return "external_api";
}

/**
 * Logs everything needed to diagnose a failure without ever exposing it to
 * the user (every route handler here keeps returning its own fixed,
 * generic message/status regardless of what this logs) — message, stack,
 * one level of `cause` (message/stack, plus its own code/context if it's
 * itself an `AppError`, e.g. the Anthropic status/response/request id
 * `ClaudeClient` attaches), and this `AppError`'s own `code`/`context`.
 * In development, also prints the raw error to the console so the full,
 * unredacted native stack (including Node's own nested `cause` rendering)
 * is visible while iterating locally — never in production.
 */
function logDiagnostics(message: string, error: unknown, meta: Record<string, unknown>): void {
  const cause = error instanceof Error ? error.cause : undefined;

  logger.error(message, {
    ...meta,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    code: error instanceof AppError ? error.code : undefined,
    context: error instanceof AppError ? error.context : undefined,
    cause:
      cause instanceof Error
        ? {
            message: cause.message,
            stack: cause.stack,
            code: cause instanceof AppError ? cause.code : undefined,
            context: cause instanceof AppError ? cause.context : undefined,
          }
        : cause,
  });

  if (appConfig.isDevelopment) {
    console.error(error);
  }
}

function tooManyRequestsResponse(): NextResponse {
  return errorResponse(
    429,
    "too_many_requests",
    "Too many requests. Please wait a few minutes before trying again.",
  );
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
