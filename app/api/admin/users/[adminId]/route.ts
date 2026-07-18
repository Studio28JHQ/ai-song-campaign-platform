import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_ROLES } from "@/domain/admin/types";
import { UpdateAdminUserUseCase } from "@/application/admin/use-cases/UpdateAdminUserUseCase";
import { getAdminSession } from "@/infrastructure/auth/getAdminSession";
import { PrismaAdminUserRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAdminUserRepository";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { BusinessRuleError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/** PATCH /api/admin/users/[adminId] — edits name/role from the Administradores screen (Sprint ADMIN-1). */

const adminUserRepository = new PrismaAdminUserRepository();
const auditLogRepository = new PrismaAuditLogRepository();

const updateAdminUserUseCase = new UpdateAdminUserUseCase(adminUserRepository, auditLogRepository);

const updateAdminUserSchema = z
  .object({
    name: z.string().trim().min(1),
    role: z.enum(ADMIN_ROLES),
  })
  .strict();

interface RouteContext {
  params: Promise<{ adminId: string }>;
}

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const { adminId } = await context.params;

  if (!adminId) {
    return errorResponse(400, "invalid_request", "An adminId is required.");
  }

  const session = await getAdminSession();
  if (!session) {
    return errorResponse(401, "unauthorized", "Se requiere autenticación.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "The request body must be valid JSON.");
  }

  const parsed = updateAdminUserSchema.safeParse(payload);
  if (!parsed.success) {
    return errorResponse(400, "invalid_request", "A non-empty name and a valid role are required.");
  }

  try {
    const result = await updateAdminUserUseCase.execute({
      adminId,
      name: parsed.data.name,
      role: parsed.data.role,
      actingAdminId: session.adminId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleUseCaseError(error, adminId);
  }
}

function handleUseCaseError(error: unknown, adminId: string): NextResponse {
  if (error instanceof BusinessRuleError) {
    if (error.code === "admin.forbidden") {
      return errorResponse(403, "forbidden", error.message);
    }
    if (error.code === "admin.user_not_found") {
      return errorResponse(404, "admin_not_found", error.message);
    }
    return errorResponse(422, "business_rule_violation", error.message);
  }

  logger.error("Unexpected error while updating an admin user", {
    adminId,
    error: error instanceof Error ? error.message : String(error),
  });

  return errorResponse(500, "internal_error", "Algo salió mal. Inténtalo de nuevo.");
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
