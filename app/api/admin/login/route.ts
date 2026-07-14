import { NextResponse } from "next/server";
import { z } from "zod";
import { LoginUseCase } from "@/application/admin/use-cases/LoginUseCase";
import { ScryptPasswordHasher } from "@/infrastructure/auth/ScryptPasswordHasher";
import {
  adminSessionCookieOptions,
  ADMIN_SESSION_COOKIE,
} from "@/infrastructure/auth/sessionCookie";
import { SignedSessionTokenService } from "@/infrastructure/auth/SignedSessionTokenService";
import { PrismaAdminUserRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAdminUserRepository";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { BusinessRuleError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/**
 * POST /api/admin/login — the only unauthenticated entry point into the
 * Administration module (see `middleware.ts`). Validates input, invokes
 * `LoginUseCase`, and — on success — sets the signed session as an
 * HTTP-only cookie. The token itself is never returned in the JSON body;
 * only the admin's public snapshot is.
 */

const loginUseCase = new LoginUseCase(
  new PrismaAdminUserRepository(),
  new PrismaAuditLogRepository(),
  new ScryptPasswordHasher(),
  new SignedSessionTokenService(),
);

const loginRequestSchema = z
  .object({
    email: z.string().min(1),
    password: z.string().min(1),
    rememberMe: z.boolean().optional(),
  })
  .strict();

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "The request body must be valid JSON.");
  }

  const parsed = loginRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return errorResponse(400, "invalid_request", "The request payload is invalid.");
  }

  try {
    const result = await loginUseCase.execute(parsed.data);

    const response = NextResponse.json({ admin: result.admin }, { status: 200 });
    response.cookies.set(
      ADMIN_SESSION_COOKIE,
      result.token,
      adminSessionCookieOptions(Boolean(parsed.data.rememberMe)),
    );
    return response;
  } catch (error) {
    return handleUseCaseError(error);
  }
}

function handleUseCaseError(error: unknown): NextResponse {
  if (error instanceof BusinessRuleError) {
    if (error.code === "admin.invalid_credentials") {
      return errorResponse(401, "invalid_credentials", "Invalid email or password.");
    }

    if (error.code === "admin.account_inactive") {
      return errorResponse(403, "account_inactive", "This admin account is inactive.");
    }

    return errorResponse(422, "business_rule_violation", error.message);
  }

  logger.error("Unexpected error during admin login", {
    error: error instanceof Error ? error.message : String(error),
  });

  return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
