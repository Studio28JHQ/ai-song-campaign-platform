import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_ROLES } from "@/domain/admin/types";
import { CreateAdminUserUseCase } from "@/application/admin/use-cases/CreateAdminUserUseCase";
import { ListAdminUsersUseCase } from "@/application/admin/use-cases/ListAdminUsersUseCase";
import { getAdminSession } from "@/infrastructure/auth/getAdminSession";
import { ScryptPasswordHasher } from "@/infrastructure/auth/ScryptPasswordHasher";
import { PrismaAdminUserRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAdminUserRepository";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { BusinessRuleError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/**
 * GET/POST /api/admin/users — the Administradores screen (Sprint
 * ADMIN-1 — Backoffice de Campaña). Lists and provisions operator
 * accounts; there is no self-registration for admins (see
 * `LoginUseCase`). Access is already gated by `middleware.ts`.
 */

const adminUserRepository = new PrismaAdminUserRepository();
const auditLogRepository = new PrismaAuditLogRepository();
const passwordHasher = new ScryptPasswordHasher();

const listAdminUsersUseCase = new ListAdminUsersUseCase(adminUserRepository);
const createAdminUserUseCase = new CreateAdminUserUseCase(
  adminUserRepository,
  auditLogRepository,
  passwordHasher,
);

const createAdminUserSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(8),
    name: z.string().trim().min(1),
    role: z.enum(ADMIN_ROLES),
  })
  .strict();

export async function GET(): Promise<NextResponse> {
  const session = await getAdminSession();
  if (!session) {
    return errorResponse(401, "unauthorized", "Se requiere autenticación.");
  }

  const result = await listAdminUsersUseCase.execute();
  return NextResponse.json(result, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
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

  const parsed = createAdminUserSchema.safeParse(payload);
  if (!parsed.success) {
    return errorResponse(
      400,
      "invalid_request",
      "A valid email, password (min 8 chars), name and role are required.",
    );
  }

  try {
    const result = await createAdminUserUseCase.execute({
      ...parsed.data,
      actingAdminId: session.adminId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleUseCaseError(error);
  }
}

function handleUseCaseError(error: unknown): NextResponse {
  if (error instanceof BusinessRuleError) {
    if (error.code === "admin.forbidden") {
      return errorResponse(403, "forbidden", error.message);
    }
    if (error.code === "admin.email_already_exists") {
      return errorResponse(409, "email_already_exists", error.message);
    }
    return errorResponse(422, "business_rule_violation", error.message);
  }

  logger.error("Unexpected error while creating an admin user", {
    error: error instanceof Error ? error.message : String(error),
  });

  return errorResponse(500, "internal_error", "Algo salió mal. Inténtalo de nuevo.");
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
