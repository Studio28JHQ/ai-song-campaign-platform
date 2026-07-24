import { NextResponse } from "next/server";
import { z } from "zod";
import { GetCampaignSettingsUseCase } from "@/application/admin/use-cases/GetCampaignSettingsUseCase";
import { UpdateGtmSettingsUseCase } from "@/application/admin/use-cases/UpdateGtmSettingsUseCase";
import { DEFAULT_CAMPAIGN_ID } from "@/config/constants";
import { getAdminSession } from "@/infrastructure/auth/getAdminSession";
import { PrismaCampaignSettingsGate } from "@/infrastructure/persistence/prisma/campaign/PrismaCampaignSettingsGate";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { ValidationError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/**
 * GET/PATCH /api/admin/settings — the campaign's global configuration
 * (Feature 1 — GTM Configuration). Currently just the Google Tag
 * Manager container id; access is already gated by `middleware.ts`.
 */

const campaignSettingsGate = new PrismaCampaignSettingsGate();
const auditLogRepository = new PrismaAuditLogRepository();

const getCampaignSettingsUseCase = new GetCampaignSettingsUseCase(
  campaignSettingsGate,
  DEFAULT_CAMPAIGN_ID,
);
const updateGtmSettingsUseCase = new UpdateGtmSettingsUseCase(
  campaignSettingsGate,
  auditLogRepository,
  DEFAULT_CAMPAIGN_ID,
);

const updateSettingsSchema = z.object({ gtmContainerId: z.string().nullable() }).strict();

export async function GET(): Promise<NextResponse> {
  const session = await getAdminSession();
  if (!session) {
    return errorResponse(401, "unauthorized", "Se requiere autenticación.");
  }

  try {
    const settings = await getCampaignSettingsUseCase.execute();
    return NextResponse.json(settings, { status: 200 });
  } catch (error) {
    logger.error("Unexpected error while loading campaign settings", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(500, "internal_error", "Algo salió mal. Inténtalo de nuevo.");
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
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

  const parsed = updateSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    return errorResponse(400, "invalid_request", "A `gtmContainerId` string or null is required.");
  }

  try {
    const settings = await updateGtmSettingsUseCase.execute({
      gtmContainerId: parsed.data.gtmContainerId,
      actingAdminId: session.adminId,
    });
    return NextResponse.json(settings, { status: 200 });
  } catch (error) {
    return handleUseCaseError(error);
  }
}

function handleUseCaseError(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return errorResponse(400, "invalid_request", error.message);
  }

  logger.error("Unexpected error while updating campaign settings", {
    error: error instanceof Error ? error.message : String(error),
  });

  return errorResponse(500, "internal_error", "Algo salió mal. Inténtalo de nuevo.");
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
