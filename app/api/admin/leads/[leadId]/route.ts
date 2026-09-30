import { NextResponse } from "next/server";
import { DeleteLeadUseCase } from "@/application/admin/use-cases/DeleteLeadUseCase";
import { GetLeadDetailUseCase } from "@/application/admin/use-cases/GetLeadDetailUseCase";
import { getAdminSession } from "@/infrastructure/auth/getAdminSession";
import { PrismaAdminLeadDeletionGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminLeadDeletionGate";
import { PrismaAdminLyricsAttemptGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminLyricsAttemptGate";
import { PrismaAdminShareEventGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminShareEventGate";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { PrismaLeadRepository } from "@/infrastructure/persistence/prisma/lead/PrismaLeadRepository";
import { PrismaLyricsRepository } from "@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository";
import { PrismaSongRepository } from "@/infrastructure/persistence/prisma/song/PrismaSongRepository";
import { CloudflareR2Storage } from "@/infrastructure/storage/CloudflareR2Storage";
import { R2AudioUrlResolver } from "@/infrastructure/storage/R2AudioUrlResolver";
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
  new R2AudioUrlResolver(),
  new PrismaAdminLyricsAttemptGate(),
  new PrismaAdminShareEventGate(),
);

// Sprint FINAL-5 — Test Data Cleanup. Shares this route because it acts
// on the same resource; `middleware.ts` gates the path once for both.
const deleteLeadUseCase = new DeleteLeadUseCase(
  new PrismaAdminLeadDeletionGate(),
  new PrismaAuditLogRepository(),
  // The same R2 client the pipeline already uses — its `delete` has been
  // there since the integration shipped and had no caller until now.
  new CloudflareR2Storage(),
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
    return errorResponse(401, "unauthorized", "Se requiere autenticación.");
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

    return errorResponse(500, "internal_error", "Algo salió mal. Inténtalo de nuevo.");
  }
}

/**
 * DELETE /api/admin/leads/[leadId] — Sprint FINAL-5 (Test Data Cleanup):
 * permanently removes one family and everything that belongs only to it.
 *
 * Irreversible, and deliberately narrow: it takes the family's id from
 * the path and nothing from the body, so there is no name, email or
 * filter that could ever match more than the one row the operator
 * confirmed. Access is gated by `middleware.ts` and re-checked here, the
 * same as every other administrative action on this resource, and every
 * deletion is written to the audit trail by the use case.
 */
export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { leadId } = await context.params;

  if (!leadId) {
    return errorResponse(400, "invalid_request", "A leadId is required.");
  }

  const session = await getAdminSession();
  if (!session) {
    return errorResponse(401, "unauthorized", "Se requiere autenticación.");
  }

  try {
    const result = await deleteLeadUseCase.execute({ leadId, adminId: session.adminId });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof BusinessRuleError && error.code === "admin.lead_not_found") {
      return errorResponse(404, "lead_not_found", "No se encontró esta familia.");
    }

    logger.error("Unexpected error while deleting a family", {
      leadId,
      error: error instanceof Error ? error.message : String(error),
      cause:
        error instanceof Error && error.cause instanceof Error
          ? error.cause.message.slice(0, 300)
          : undefined,
    });

    return errorResponse(
      500,
      "internal_error",
      "No se pudo eliminar la familia. Inténtalo de nuevo.",
    );
  }
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
