import { NextResponse } from "next/server";
import { z } from "zod";
import type { LeadCampaignConfig } from "@/application/lead/contracts/LeadCampaignConfig";
import { CreateLeadUseCase } from "@/application/lead/use-cases/CreateLeadUseCase";
import { RateLimiter } from "@/application/security/services/RateLimiter";
import { SecurityEventRecorder } from "@/application/security/services/SecurityEventRecorder";
import { appConfig } from "@/config/app";
import {
  LEAD_SESSION_COOKIE,
  leadSessionCookieOptions,
} from "@/infrastructure/auth/leadSessionCookie";
import { PrismaLeadSessionService } from "@/infrastructure/auth/PrismaLeadSessionService";
import { getClientIp } from "@/infrastructure/http/getClientIp";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { PrismaLeadRepository } from "@/infrastructure/persistence/prisma/lead/PrismaLeadRepository";
import { PrismaRateLimitRepository } from "@/infrastructure/persistence/prisma/security/PrismaRateLimitRepository";
import { TurnstileClient } from "@/infrastructure/security/turnstile/TurnstileClient";
import { TurnstileVerifier } from "@/infrastructure/security/turnstile/TurnstileVerifier";
import { BusinessRuleError, ExternalApiError, ValidationError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";
import { FIELD_LIMITS } from "@/shared/validation/text";
import {
  emailField,
  optionalPhoneField,
  optionalPlainTextField,
  plainTextField,
} from "@/shared/validation/zodFields";

/**
 * POST /api/leads — registers a new lead for the campaign.
 *
 * This file only validates input, invokes `CreateLeadUseCase`, and maps
 * the result/errors to an HTTP response. No business rule is evaluated
 * here — those live in the Application and Domain layers.
 *
 * On success, it also issues a parent session (see
 * `docs/Architecture/System_Architecture.md` — Parent Session) and sets
 * it as an HttpOnly cookie. The Lead id itself is never returned in the
 * response body — the browser only ever holds the opaque session token.
 */

const campaignConfig: LeadCampaignConfig = {
  getMaxLyricAttempts: () => appConfig.campaign.maxLyricAttempts,
};

const createLeadUseCase = new CreateLeadUseCase(new PrismaLeadRepository(), campaignConfig);
const leadSessionService = new PrismaLeadSessionService();
const rateLimiter = new RateLimiter(new PrismaRateLimitRepository());
const securityEventRecorder = new SecurityEventRecorder(new PrismaAuditLogRepository());
const turnstileVerifier = new TurnstileVerifier(new TurnstileClient());

// Structural validation (shape/type/presence) plus the shared Sprint 8.1
// input-hardening rules (trim, collapse whitespace, Unicode
// normalization, control-character/HTML/length limits — see
// `@/shared/validation`). Domain value objects remain the authoritative
// enforcement point (e.g. age bounds); this schema exists for early
// rejection and consistent, user-friendly messages at the boundary.
const createLeadRequestSchema = z
  .object({
    campaignId: z.string().min(1),
    parentName: plainTextField("Parent name", FIELD_LIMITS.parentName),
    babyName: plainTextField("Baby name", FIELD_LIMITS.babyName),
    babyAge: z.number().int().optional(),
    city: optionalPlainTextField("City", FIELD_LIMITS.city),
    email: emailField(),
    phone: optionalPhoneField(),
    turnstileToken: z.string().min(1, "Human verification is required."),
  })
  .strict();

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "The request body must be valid JSON.");
  }

  const parsed = createLeadRequestSchema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "The request payload is invalid.";
    return errorResponse(400, "invalid_request", message);
  }

  const ip = getClientIp(request);

  const ipLimit = await rateLimiter.consume({
    key: `registration:ip:${ip}`,
    limit: appConfig.security.rateLimit.maxRegistrationsPerIp,
    windowMinutes: appConfig.security.rateLimit.windowMinutes,
  });
  if (!ipLimit.allowed) {
    await securityEventRecorder.record({
      action: "rate_limit_exceeded",
      entity: "IpAddress",
      metadata: { ip, scope: "registration" },
    });
    return tooManyRequestsResponse();
  }

  try {
    const verification = await turnstileVerifier.verify(parsed.data.turnstileToken, ip);
    if (!verification.success) {
      await securityEventRecorder.record({
        action: "invalid_turnstile_token",
        entity: "IpAddress",
        metadata: { ip, scope: "registration", errorCodes: verification.errorCodes },
      });
      return errorResponse(
        403,
        "human_verification_failed",
        "We couldn't verify you're not a robot. Please try again.",
      );
    }
  } catch (error) {
    return handleTurnstileError(error);
  }

  const emailLimit = await rateLimiter.consume({
    key: `registration:email:${parsed.data.email}`,
    limit: appConfig.security.rateLimit.maxRegistrationsPerEmail,
    windowMinutes: appConfig.security.rateLimit.windowMinutes,
  });
  if (!emailLimit.allowed) {
    await securityEventRecorder.record({
      action: "rate_limit_exceeded",
      entity: "Email",
      metadata: { email: parsed.data.email, scope: "registration" },
    });
    return tooManyRequestsResponse();
  }

  try {
    const result = await createLeadUseCase.execute(parsed.data);
    const session = await leadSessionService.create(result.lead.id);

    const response = NextResponse.json(
      {
        remainingAttempts: result.lead.remainingAttempts,
        status: result.lead.status,
      },
      { status: 201 },
    );

    response.cookies.set(LEAD_SESSION_COOKIE, session.token, leadSessionCookieOptions());

    return response;
  } catch (error) {
    return handleUseCaseError(error);
  }
}

function handleUseCaseError(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return errorResponse(400, "invalid_request", error.message);
  }

  if (error instanceof BusinessRuleError) {
    if (error.code === "lead.email_already_registered") {
      return errorResponse(409, "email_already_registered", error.message);
    }

    return errorResponse(422, "business_rule_violation", error.message);
  }

  logger.error("Unexpected error while creating a lead", {
    error: error instanceof Error ? error.message : String(error),
  });

  return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
}

function handleTurnstileError(error: unknown): NextResponse {
  if (error instanceof ExternalApiError) {
    logger.error("Turnstile verification failed", {
      error: error.message,
      code: error.code,
    });

    return errorResponse(
      503,
      "verification_unavailable",
      "Verification is temporarily unavailable. Please try again shortly.",
    );
  }

  logger.error("Unexpected error while verifying Turnstile token", {
    error: error instanceof Error ? error.message : String(error),
  });

  return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
}

function tooManyRequestsResponse(): NextResponse {
  return errorResponse(
    429,
    "too_many_requests",
    "Too many requests. Please wait a few minutes before trying again.",
  );
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
