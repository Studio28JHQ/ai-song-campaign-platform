import type {
  CampaignSettingsGate,
  GenerationRouting,
} from "@/application/campaign/contracts/CampaignSettingsGate";
import {
  SONG_GENERATION_PROVIDERS,
  type SongGenerationProviderName,
} from "@/application/song/contracts/SongGenerationProvider";
import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import { ValidationError } from "@/shared/errors";
import type { UpdateGenerationRoutingRequest } from "../dto/CampaignSettingsDto";

/**
 * Persists the campaign's generation routing from the Admin panel — the
 * strict half of the read-permissive/write-strict pair described on
 * `CampaignSettingsGate`.
 *
 * Every rule is enforced here, server-side, and never only in the form:
 * the primary must be a known provider, the fallback must be a known
 * provider or explicitly absent, and the two may not be the same (a
 * provider cannot be its own fallback — that would just retry a failure
 * that the whitelist already decided was worth escaping).
 *
 * Mirrors `UpdateGtmSettingsUseCase`, including its audit-log entry, so
 * both global settings behave the same way for the campaign team.
 */
export class UpdateGenerationRoutingUseCase {
  constructor(
    private readonly campaignSettingsGate: CampaignSettingsGate,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly campaignId: string,
  ) {}

  async execute(request: UpdateGenerationRoutingRequest): Promise<GenerationRouting> {
    const primaryProvider = this.requireKnownProvider(request.primaryProvider, "primary");
    const fallbackProvider =
      request.fallbackProvider === null
        ? null
        : this.requireKnownProvider(request.fallbackProvider, "fallback");

    if (fallbackProvider !== null && fallbackProvider === primaryProvider) {
      throw new ValidationError(
        "The fallback provider must be different from the primary provider.",
        {
          code: "campaign.invalid_generation_routing",
          context: { primaryProvider, fallbackProvider },
        },
      );
    }

    const routing = await this.campaignSettingsGate.updateGenerationRouting(this.campaignId, {
      primaryProvider,
      fallbackProvider,
    });

    await this.auditLogRepository.create(
      AuditLogEntry.create({
        adminId: request.actingAdminId,
        action: "update_generation_routing",
        entity: "Campaign",
        entityId: this.campaignId,
        metadata: {
          primaryProvider: routing.primaryProvider,
          fallbackProvider: routing.fallbackProvider,
        },
      }),
    );

    return routing;
  }

  private requireKnownProvider(value: string, field: string): SongGenerationProviderName {
    const normalized = value?.trim().toLowerCase() ?? "";

    if (!SONG_GENERATION_PROVIDERS.includes(normalized as SongGenerationProviderName)) {
      throw new ValidationError(
        `The ${field} provider must be one of: ${SONG_GENERATION_PROVIDERS.join(", ")}.`,
        { code: "campaign.invalid_generation_routing", context: { field, value } },
      );
    }

    return normalized as SongGenerationProviderName;
  }
}
