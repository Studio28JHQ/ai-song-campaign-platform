import { NextResponse } from "next/server";
import { z } from "zod";
import { ListAuditLogUseCase } from "@/application/admin/use-cases/ListAuditLogUseCase";
import { getAdminSession } from "@/infrastructure/auth/getAdminSession";
import { PrismaAdminUserRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAdminUserRepository";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { ValidationError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/**
 * GET /api/admin/audit — the "Auditoría" screen (Sprint ADMIN-1 —
 * Backoffice de Campaña; paginated/searchable as of Sprint FINAL-1 —
 * Production Hardening). Read-only: the most recent audit entries,
 * newest first. Access is already gated by `middleware.ts`.
 */

const listAuditLogUseCase = new ListAuditLogUseCase(
  new PrismaAuditLogRepository(),
  new PrismaAdminUserRepository(),
);

const searchParamsSchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().optional(),
  pageSize: z.coerce.number().int().optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getAdminSession();
  if (!session) {
    return errorResponse(401, "unauthorized", "Se requiere autenticación.");
  }

  const { searchParams } = new URL(request.url);

  const parsed = searchParamsSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse(400, "invalid_request", "The search parameters are invalid.");
  }

  try {
    const result = await listAuditLogUseCase.execute({
      query: parsed.data.q,
      page: parsed.data.page ?? 1,
      pageSize: parsed.data.pageSize ?? 20,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errorResponse(400, "invalid_request", error.message);
    }

    logger.error("Unexpected error while listing audit log entries", {
      error: error instanceof Error ? error.message : String(error),
    });

    return errorResponse(500, "internal_error", "Algo salió mal. Inténtalo de nuevo.");
  }
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
