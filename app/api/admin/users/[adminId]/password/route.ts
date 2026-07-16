import { NextResponse } from "next/server";
import { z } from "zod";
import { ChangeAdminPasswordUseCase } from "@/application/admin/use-cases/ChangeAdminPasswordUseCase";
import { getAdminSession } from "@/infrastructure/auth/getAdminSession";
import { ScryptPasswordHasher } from "@/infrastructure/auth/ScryptPasswordHasher";
import { PrismaAdminUserRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAdminUserRepository";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { BusinessRuleError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/** POST /api/admin/users/[adminId]/password — resets an operator's password from the Administradores screen (Sprint ADMIN-1). */

const adminUserRepository = new PrismaAdminUserRepository();
const auditLogRepository = new PrismaAuditLogRepository();
const passwordHasher = new ScryptPasswordHasher();

const changeAdminPasswordUseCase = new ChangeAdminPasswordUseCase(
  adminUserRepository,
  auditLogRepository,
  passwordHasher,
);

const changePasswordSchema = z.object({ newPassword: z.string().min(8) }).strict();

interface RouteContext {
  params: Promise<{ adminId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const { adminId } = await context.params;

  if (!adminId) {
    return errorResponse(400, "invalid_request", "An adminId is required.");
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

  const parsed = changePasswordSchema.safeParse(payload);
  if (!parsed.success) {
    return errorResponse(
      400,
      "invalid_request",
      "A newPassword of at least 8 characters is required.",
    );
  }

  try {
    const result = await changeAdminPasswordUseCase.execute({
      adminId,
      newPassword: parsed.data.newPassword,
      actingAdminId: session.adminId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleUseCaseError(error, adminId);
  }
}

function handleUseCaseError(error: unknown, adminId: string): NextResponse {
  if (error instanceof BusinessRuleError) {
    if (error.code === "admin.user_not_found") {
      return errorResponse(404, "admin_not_found", error.message);
    }
    return errorResponse(422, "business_rule_violation", error.message);
  }

  logger.error("Unexpected error while changing an admin user's password", {
    adminId,
    error: error instanceof Error ? error.message : String(error),
  });

  return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
