import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateGenerationRoutingUseCase } from "@/application/admin/use-cases/UpdateGenerationRoutingUseCase";
import type {
  CampaignSettingsGate,
  GenerationRouting,
} from "@/application/campaign/contracts/CampaignSettingsGate";
import type { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import { ValidationError } from "@/shared/errors";

const CAMPAIGN_ID = "00000000-0000-0000-0000-000000000000";
const ADMIN_ID = "11111111-1111-1111-1111-111111111111";

class InMemoryAuditLogRepository implements AuditLogRepository {
  readonly entries: AuditLogEntry[] = [];
  async create(entry: AuditLogEntry): Promise<AuditLogEntry> {
    this.entries.push(entry);
    return entry;
  }
  async findByEntity(entity: string, entityId: string): Promise<AuditLogEntry[]> {
    return this.entries.filter((e) => e.entity === entity && e.entityId === entityId);
  }
  async findRecent(): Promise<{ items: AuditLogEntry[]; total: number }> {
    return { items: this.entries, total: this.entries.length };
  }
}

describe("UpdateGenerationRoutingUseCase", () => {
  let gate: CampaignSettingsGate;
  let updateGenerationRouting: CampaignSettingsGate["updateGenerationRouting"];
  let auditLogRepository: InMemoryAuditLogRepository;

  beforeEach(() => {
    updateGenerationRouting = vi.fn(
      async (_campaignId: string, routing: GenerationRouting) => routing,
    ) as CampaignSettingsGate["updateGenerationRouting"];
    gate = {
      getGtmContainerId: vi.fn(),
      updateGtmContainerId: vi.fn(),
      getGenerationRouting: vi.fn(),
      updateGenerationRouting,
    };
    auditLogRepository = new InMemoryAuditLogRepository();
  });

  function buildUseCase(): UpdateGenerationRoutingUseCase {
    return new UpdateGenerationRoutingUseCase(gate, auditLogRepository, CAMPAIGN_ID);
  }

  it("persists a valid routing and records an audit entry", async () => {
    const result = await buildUseCase().execute({
      primaryProvider: "lyria",
      fallbackProvider: "mureka",
      actingAdminId: ADMIN_ID,
    });

    expect(result).toEqual({ primaryProvider: "lyria", fallbackProvider: "mureka" });
    expect(updateGenerationRouting).toHaveBeenCalledWith(CAMPAIGN_ID, {
      primaryProvider: "lyria",
      fallbackProvider: "mureka",
    });
    expect(auditLogRepository.entries).toHaveLength(1);
    expect(auditLogRepository.entries[0].action).toBe("update_generation_routing");
  });

  it("accepts a null fallback, which disables fallback entirely", async () => {
    const result = await buildUseCase().execute({
      primaryProvider: "mureka",
      fallbackProvider: null,
      actingAdminId: ADMIN_ID,
    });

    expect(result.fallbackProvider).toBeNull();
  });

  it("rejects the same provider as both primary and fallback", async () => {
    await expect(
      buildUseCase().execute({
        primaryProvider: "mureka",
        fallbackProvider: "mureka",
        actingAdminId: ADMIN_ID,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(updateGenerationRouting).not.toHaveBeenCalled();
    expect(auditLogRepository.entries).toHaveLength(0);
  });

  it.each([
    ["an unknown primary", { primaryProvider: "suno", fallbackProvider: "lyria" }],
    ["an unknown fallback", { primaryProvider: "mureka", fallbackProvider: "suno" }],
    ["an empty primary", { primaryProvider: "", fallbackProvider: "lyria" }],
  ])("rejects %s provider server-side", async (_label, routing) => {
    await expect(
      buildUseCase().execute({ ...routing, actingAdminId: ADMIN_ID }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(updateGenerationRouting).not.toHaveBeenCalled();
  });

  it("normalises casing and surrounding whitespace before persisting", async () => {
    const result = await buildUseCase().execute({
      primaryProvider: " Lyria ",
      fallbackProvider: "MUREKA",
      actingAdminId: ADMIN_ID,
    });

    expect(result).toEqual({ primaryProvider: "lyria", fallbackProvider: "mureka" });
  });
});
