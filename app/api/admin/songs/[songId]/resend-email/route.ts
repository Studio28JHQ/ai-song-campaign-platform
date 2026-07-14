import { NextResponse } from "next/server";
import { z } from "zod";
import { ResendSongEmailUseCase } from "@/application/admin/use-cases/ResendSongEmailUseCase";
import { getAdminSession } from "@/infrastructure/auth/getAdminSession";
import { ResendEmailService } from "@/infrastructure/email/ResendEmailService";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { PrismaLeadRepository } from "@/infrastructure/persistence/prisma/lead/PrismaLeadRepository";
import { PrismaSongRepository } from "@/infrastructure/persistence/prisma/song/PrismaSongRepository";
import { BusinessRuleError, ExternalApiError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/**
 * POST /api/admin/songs/[songId]/resend-email — the "Resend email"
 * operational recovery action (see docs/Product/User_Flow.md), available
 * only once the song is `COMPLETED` and the automatic delivery has
 * already gone out. Sends exactly one additional copy and records who
 * requested it, when, and why — it never touches the automatic
 * delivery's one-time claim (see docs/Architecture/External_Services.md).
 */

const songRepository = new PrismaSongRepository();
const leadRepository = new PrismaLeadRepository();
const emailSender = new ResendEmailService();
const auditLogRepository = new PrismaAuditLogRepository();

const resendSongEmailUseCase = new ResendSongEmailUseCase(
  songRepository,
  leadRepository,
  emailSender,
  auditLogRepository,
);

const resendEmailRequestSchema = z.object({ reason: z.string().trim().min(1) }).strict();

interface RouteContext {
  params: Promise<{ songId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const { songId } = await context.params;

  if (!songId) {
    return errorResponse(400, "invalid_request", "A songId is required.");
  }

  const session = await getAdminSession();
  if (!session) {
    return errorResponse(401, "unauthorized", "Authentication required.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "The request body must be valid JSON.");
  }

  const parsed = resendEmailRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return errorResponse(400, "invalid_request", "A non-empty reason is required.");
  }

  try {
    await resendSongEmailUseCase.execute({
      songId,
      adminId: session.adminId,
      reason: parsed.data.reason,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return handleUseCaseError(error, songId);
  }
}

function handleUseCaseError(error: unknown, songId: string): NextResponse {
  if (error instanceof BusinessRuleError) {
    if (error.code === "admin.song_not_found" || error.code === "admin.lead_not_found") {
      return errorResponse(404, "not_found", error.message);
    }

    if (error.code === "admin.song_not_completed" || error.code === "admin.email_not_sent_yet") {
      return errorResponse(422, "resend_not_allowed", error.message);
    }

    return errorResponse(422, "business_rule_violation", error.message);
  }

  if (error instanceof ExternalApiError) {
    logger.error("Resend API failure while manually resending a song email", {
      songId,
      error: error.message,
      code: error.code,
    });

    return errorResponse(
      503,
      "email_provider_unavailable",
      "The email service is temporarily unavailable. Please try again shortly.",
    );
  }

  logger.error("Unexpected error while resending a song email", {
    songId,
    error: error instanceof Error ? error.message : String(error),
  });

  return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
