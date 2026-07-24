import { NextResponse } from "next/server";
import { GetCampaignSettingsUseCase } from "@/application/admin/use-cases/GetCampaignSettingsUseCase";
import { DEFAULT_CAMPAIGN_ID } from "@/config/constants";
import { PrismaCampaignSettingsGate } from "@/infrastructure/persistence/prisma/campaign/PrismaCampaignSettingsGate";
import { logger } from "@/shared/logger/logger";

/**
 * GET /api/settings/gtm — public, read-only: the Landing's only way to
 * know whether Google Tag Manager is configured (Feature 1 — GTM
 * Configuration). A GTM container id is not a secret — every real GTM
 * deployment already ships it in public page source — so this endpoint
 * needs no authentication, unlike `/api/admin/settings` (which can also
 * write it). Reuses `GetCampaignSettingsUseCase` unchanged.
 */

const getCampaignSettingsUseCase = new GetCampaignSettingsUseCase(
  new PrismaCampaignSettingsGate(),
  DEFAULT_CAMPAIGN_ID,
);

export async function GET(): Promise<NextResponse> {
  try {
    const settings = await getCampaignSettingsUseCase.execute();
    return NextResponse.json(settings, { status: 200 });
  } catch (error) {
    logger.error("Unexpected error while loading public GTM settings", {
      error: error instanceof Error ? error.message : String(error),
    });

    // Best-effort: a failure here must never break the Landing — the
    // client simply renders no GTM code, the same as "not configured".
    return NextResponse.json({ gtmContainerId: null }, { status: 200 });
  }
}
