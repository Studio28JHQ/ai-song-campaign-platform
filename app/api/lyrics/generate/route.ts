import { NextResponse } from "next/server";
import { z } from "zod";
import { GenerateLyricsForLeadUseCase } from "@/application/lyrics/use-cases/GenerateLyricsForLeadUseCase";
import { ClaudeLyricsService } from "@/infrastructure/ai/claude/ClaudeLyricsService";
import { getLeadSession } from "@/infrastructure/auth/getLeadSession";
import { PrismaLeadRepository } from "@/infrastructure/persistence/prisma/lead/PrismaLeadRepository";
import { PrismaLyricsRepository } from "@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository";
import { BusinessRuleError, ExternalApiError, ValidationError } from "@/shared/errors";
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
 */

const generateLyricsUseCase = new GenerateLyricsForLeadUseCase(
  new PrismaLeadRepository(),
  new PrismaLyricsRepository(),
  new ClaudeLyricsService(),
);

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

  if (error instanceof ExternalApiError) {
    logger.error("Claude API failure while generating lyrics", {
      error: error.message,
      code: error.code,
    });

    return errorResponse(
      503,
      "claude_unavailable",
      "The lyrics generation service is temporarily unavailable. Please try again shortly.",
    );
  }

  logger.error("Unexpected error while generating lyrics", {
    error: error instanceof Error ? error.message : String(error),
  });

  return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
