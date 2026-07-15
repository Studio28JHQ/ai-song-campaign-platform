import { describe, expect, it, vi } from "vitest";
import { SecurityEventRecorder } from "@/application/security/services/SecurityEventRecorder";
import type { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";

function fakeRepository(create: AuditLogRepository["create"]): AuditLogRepository {
  return { create, findByEntity: vi.fn().mockResolvedValue([]) };
}

describe("SecurityEventRecorder.record", () => {
  it("persists a system-recorded event (adminId: null) with the given action/entity/entityId/metadata", async () => {
    const create = vi.fn().mockImplementation(async (entry: AuditLogEntry) => entry);
    const recorder = new SecurityEventRecorder(fakeRepository(create));

    await recorder.record({
      action: "rate_limit_exceeded",
      entity: "IpAddress",
      entityId: null,
      metadata: { ip: "203.0.113.4", scope: "registration" },
    });

    expect(create).toHaveBeenCalledTimes(1);
    const persisted = create.mock.calls[0][0] as AuditLogEntry;
    expect(persisted.adminId).toBeNull();
    expect(persisted.action).toBe("rate_limit_exceeded");
    expect(persisted.entity).toBe("IpAddress");
    expect(persisted.entityId).toBeNull();
    expect(persisted.metadata).toEqual({ ip: "203.0.113.4", scope: "registration" });
  });

  it("defaults entityId and metadata to null when omitted", async () => {
    const create = vi.fn().mockImplementation(async (entry: AuditLogEntry) => entry);
    const recorder = new SecurityEventRecorder(fakeRepository(create));

    await recorder.record({ action: "invalid_turnstile_token", entity: "Lead" });

    const persisted = create.mock.calls[0][0] as AuditLogEntry;
    expect(persisted.entityId).toBeNull();
    expect(persisted.metadata).toBeNull();
  });

  it("records an excessive_generation_attempts event tied to a Lead", async () => {
    const create = vi.fn().mockImplementation(async (entry: AuditLogEntry) => entry);
    const recorder = new SecurityEventRecorder(fakeRepository(create));

    await recorder.record({
      action: "excessive_generation_attempts",
      entity: "Lead",
      entityId: "lead-1",
      metadata: { scope: "lyrics_generation" },
    });

    const persisted = create.mock.calls[0][0] as AuditLogEntry;
    expect(persisted.action).toBe("excessive_generation_attempts");
    expect(persisted.entityId).toBe("lead-1");
  });

  it("never throws when the repository fails — logging is best-effort", async () => {
    const create = vi.fn().mockRejectedValue(new Error("connection reset"));
    const recorder = new SecurityEventRecorder(fakeRepository(create));

    await expect(
      recorder.record({ action: "rate_limit_exceeded", entity: "IpAddress" }),
    ).resolves.toBeUndefined();
  });
});
