import { NextResponse } from "next/server";
import { z } from "zod";
import { ApproveLyricsUseCase } from "@/application/lyrics/use-cases/ApproveLyricsUseCase";
import { PrismaLyricsRepository } from "@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository";
import { BusinessRuleError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/**
 * POST /api/lyrics/approve — approves a lyrics version for a lead. This
 * file only validates input, invokes `ApproveLyricsUseCase`, and maps the
 * result/errors to an HTTP response.
 */

const approveLyricsUseCase = new ApproveLyricsUseCase(new PrismaLyricsRepository());

const approveLyricsRequestSchema = z
  .object({
    lyricsId: z.string().min(1),
  })
  .strict();

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "The request body must be valid JSON.");
  }

  const parsed = approveLyricsRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return errorResponse(400, "invalid_request", "The request payload is invalid.");
  }

  try {
    const result = await approveLyricsUseCase.execute(parsed.data);

    return NextResponse.json({ lyrics: result.lyrics }, { status: 200 });
  } catch (error) {
    return handleUseCaseError(error);
  }
}

function handleUseCaseError(error: unknown): NextResponse {
  if (error instanceof BusinessRuleError) {
    if (error.code === "lyrics.not_found") {
      return errorResponse(404, "lyrics_not_found", error.message);
    }

    return errorResponse(422, "business_rule_violation", error.message);
  }

  logger.error("Unexpected error while approving lyrics", {
    error: error instanceof Error ? error.message : String(error),
  });

  return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
