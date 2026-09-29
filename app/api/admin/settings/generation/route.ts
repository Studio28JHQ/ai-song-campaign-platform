import { NextResponse } from "next/server";
import { z } from "zod";
import { GetCampaignSettingsUseCase } from "@/application/admin/use-cases/GetCampaignSettingsUseCase";
import { UpdateGenerationRoutingUseCase } from "@/application/admin/use-cases/UpdateGenerationRoutingUseCase";
import { DEFAULT_CAMPAIGN_ID } from "@/config/constants";
import { getAdminSession } from "@/infrastructure/auth/getAdminSession";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { PrismaCampaignSettingsGate } from "@/infrastructure/persistence/prisma/campaign/PrismaCampaignSettingsGate";
import { ValidationError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/**
 * PATCH /api/admin/settings/generation — sets which provider generates new
 * songs (and which one, if any, covers a whitelisted pre-generation
 * failure). A sibling of `PATCH /api/admin/settings`, deliberately its own
 * route rather than another branch of that endpoint's payload: the GTM
 * setting's request shape and validation stay untouched.
 *
 * Admin-session gated with the exact same `getAdminSession()` check every
 * other admin endpoint uses — no new authorization path. Validation is
 * re-done server-side in `UpdateGenerationRoutingUseCase`; the form's own
 * `<select>` options are a convenience, never the enforcement.
 *
 * The change takes effect on the next dispatcher tick, with no redeploy and
 * no restart: `GenerationDispatcher` reads the routing from the database
 * every time it runs. Songs already submitted keep their own provider (see
 * `Song.assignProvider`).
 */

const campaignSettingsGate = new PrismaCampaignSettingsGate();
const auditLogRepository = new PrismaAuditLogRepository();

const getCampaignSettingsUseCase = new GetCampaignSettingsUseCase(
  campaignSettingsGate,
  DEFAULT_CAMPAIGN_ID,
);
const updateGenerationRoutingUseCase = new UpdateGenerationRoutingUseCase(
  campaignSettingsGate,
  auditLogRepository,
  DEFAULT_CAMPAIGN_ID,
);

const updateRoutingSchema = z
  .object({
    primaryProvider: z.string().min(1),
    fallbackProvider: z.string().min(1).nullable(),
  })
  .strict();

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

  const parsed = updateRoutingSchema.safeParse(payload);
  if (!parsed.success) {
    return errorResponse(
      400,
      "invalid_request",
      "A `primaryProvider` string and a `fallbackProvider` string or null are required.",
    );
  }

  try {
    await updateGenerationRoutingUseCase.execute({
      primaryProvider: parsed.data.primaryProvider,
      fallbackProvider: parsed.data.fallbackProvider,
      actingAdminId: session.adminId,
    });

    // Returns the full settings payload so the Admin screen's single
    // `CampaignSettings` shape stays valid after either form saves.
    const settings = await getCampaignSettingsUseCase.execute();
    return NextResponse.json(settings, { status: 200 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errorResponse(400, "invalid_request", error.message);
    }

    logger.error("Unexpected error while updating generation routing", {
      error: error instanceof Error ? error.message : String(error),
    });

    return errorResponse(500, "internal_error", "Algo salió mal. Inténtalo de nuevo.");
  }
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
