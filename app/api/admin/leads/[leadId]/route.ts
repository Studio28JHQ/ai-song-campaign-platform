import { NextResponse } from "next/server";
import { GetLeadDetailUseCase } from "@/application/admin/use-cases/GetLeadDetailUseCase";
import { getAdminSession } from "@/infrastructure/auth/getAdminSession";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { PrismaLeadRepository } from "@/infrastructure/persistence/prisma/lead/PrismaLeadRepository";
import { PrismaLyricsRepository } from "@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository";
import { PrismaSongRepository } from "@/infrastructure/persistence/prisma/song/PrismaSongRepository";
import { BusinessRuleError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/**
 * GET /api/admin/leads/[leadId] — the read-only Lead Detail screen data:
 * lead information, full lyrics history, the approved version, song
 * status/audio, and audit history (see docs/Product/User_Flow.md). Access
 * is already gated by `middleware.ts`; this route additionally reads the
 * session to attribute the "view_lead" audit entry to the acting admin.
 */

const getLeadDetailUseCase = new GetLeadDetailUseCase(
  new PrismaLeadRepository(),
  new PrismaLyricsRepository(),
  new PrismaSongRepository(),
  new PrismaAuditLogRepository(),
);

interface RouteContext {
  params: Promise<{ leadId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { leadId } = await context.params;

  if (!leadId) {
    return errorResponse(400, "invalid_request", "A leadId is required.");
  }

  const session = await getAdminSession();
  if (!session) {
    // Defense in depth: `middleware.ts` already gates this route, but a
    // missing/expired session by the time this line runs must never be
    // attributed to a phantom admin in the audit trail.
    return errorResponse(401, "unauthorized", "Authentication required.");
  }

  try {
    const result = await getLeadDetailUseCase.execute({ leadId, viewingAdminId: session.adminId });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof BusinessRuleError && error.code === "admin.lead_not_found") {
      return errorResponse(404, "lead_not_found", error.message);
    }

    logger.error("Unexpected error while loading lead detail", {
      leadId,
      error: error instanceof Error ? error.message : String(error),
    });

    return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
  }
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
