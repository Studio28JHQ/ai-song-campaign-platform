import type { CampaignSettingsGate } from "@/application/campaign/contracts/CampaignSettingsGate";
import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import { ValidationError } from "@/shared/errors";
import type {
  CampaignSettingsResponse,
  UpdateGtmSettingsRequest,
} from "../dto/CampaignSettingsDto";

/** Official Google Tag Manager container id shape — e.g. "GTM-XXXXXXX". */
const GTM_CONTAINER_ID_PATTERN = /^GTM-[A-Z0-9]+$/;

/**
 * Updates the campaign's Google Tag Manager container id from the Admin
 * Settings screen (Feature 1 — GTM Configuration). An empty/blank value
 * clears it — no GTM code is rendered on the Landing once cleared. No
 * environment variable, no hardcoded id: this is the only place the
 * value is ever written.
 */
export class UpdateGtmSettingsUseCase {
  constructor(
    private readonly campaignSettingsGate: CampaignSettingsGate,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly campaignId: string,
  ) {}

  async execute(request: UpdateGtmSettingsRequest): Promise<CampaignSettingsResponse> {
    const normalized = this.normalize(request.gtmContainerId);

    const gtmContainerId = await this.campaignSettingsGate.updateGtmContainerId(
      this.campaignId,
      normalized,
    );

    await this.auditLogRepository.create(
      AuditLogEntry.create({
        adminId: request.actingAdminId,
        action: "update_gtm_settings",
        entity: "Campaign",
        entityId: this.campaignId,
        metadata: { gtmContainerId },
      }),
    );

    return { gtmContainerId };
  }

  private normalize(value: string | null): string | null {
    const trimmed = value?.trim() ?? "";
    if (trimmed.length === 0) {
      return null;
    }

    const upper = trimmed.toUpperCase();
    if (!GTM_CONTAINER_ID_PATTERN.test(upper)) {
      throw new ValidationError(
        'Enter a valid Google Tag Manager container id (e.g. "GTM-XXXXXXX"), or leave it empty to disable GTM.',
        { code: "campaign.invalid_gtm_container_id", context: { value } },
      );
    }

    return upper;
  }
}
