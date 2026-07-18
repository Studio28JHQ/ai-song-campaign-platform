import { NextResponse } from "next/server";
import { z } from "zod";
import { LoginUseCase } from "@/application/admin/use-cases/LoginUseCase";
import { RateLimiter } from "@/application/security/services/RateLimiter";
import { SecurityEventRecorder } from "@/application/security/services/SecurityEventRecorder";
import { appConfig } from "@/config/app";
import { ScryptPasswordHasher } from "@/infrastructure/auth/ScryptPasswordHasher";
import {
  adminSessionCookieOptions,
  ADMIN_SESSION_COOKIE,
} from "@/infrastructure/auth/sessionCookie";
import { SignedSessionTokenService } from "@/infrastructure/auth/SignedSessionTokenService";
import { getClientIp } from "@/infrastructure/http/getClientIp";
import { PrismaAdminUserRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAdminUserRepository";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { PrismaRateLimitRepository } from "@/infrastructure/persistence/prisma/security/PrismaRateLimitRepository";
import { BusinessRuleError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/**
 * POST /api/admin/login — the only unauthenticated entry point into the
 * Administration module (see `middleware.ts`). Validates input, invokes
 * `LoginUseCase`, and — on success — sets the signed session as an
 * HTTP-only cookie. The token itself is never returned in the JSON body;
 * only the admin's public snapshot is.
 *
 * RC-2 — Production Hardening: this is the one endpoint protecting the
 * entire admin surface, so it now gets the exact same abuse-protection
 * treatment every public endpoint already has (Sprint 8.2) — IP-based
 * rate limiting, and suspicious-behavior recording via
 * `SecurityEventRecorder` (which itself writes an `AuditLog` entry, same
 * as every other call site). Authentication itself (`LoginUseCase`) is
 * unchanged — this only wraps it.
 */

const loginUseCase = new LoginUseCase(
  new PrismaAdminUserRepository(),
  new PrismaAuditLogRepository(),
  new ScryptPasswordHasher(),
  new SignedSessionTokenService(),
);
const rateLimiter = new RateLimiter(new PrismaRateLimitRepository());
const securityEventRecorder = new SecurityEventRecorder(new PrismaAuditLogRepository());

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

  const ip = getClientIp(request);

  const loginLimit = await rateLimiter.consume({
    key: `admin_login:ip:${ip}`,
    limit: appConfig.security.rateLimit.maxAdminLoginAttemptsPerWindow,
    windowMinutes: appConfig.security.rateLimit.windowMinutes,
  });
  if (!loginLimit.allowed) {
    await securityEventRecorder.record({
      action: "rate_limit_exceeded",
      entity: "IpAddress",
      metadata: { ip, scope: "admin_login" },
    });
    return errorResponse(
      429,
      "too_many_requests",
      "Too many requests. Please wait a few minutes before trying again.",
    );
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
    return handleUseCaseError(error, ip, parsed.data.email);
  }
}

async function handleUseCaseError(
  error: unknown,
  ip: string,
  attemptedEmail: string,
): Promise<NextResponse> {
  if (error instanceof BusinessRuleError) {
    if (error.code === "admin.invalid_credentials") {
      await securityEventRecorder.record({
        action: "invalid_login_credentials",
        entity: "AdminUser",
        metadata: { ip, email: attemptedEmail },
      });
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

  return errorResponse(500, "internal_error", "Algo salió mal. Inténtalo de nuevo.");
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
