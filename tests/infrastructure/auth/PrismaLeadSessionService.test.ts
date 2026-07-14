import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaLeadSessionService } from "@/infrastructure/auth/PrismaLeadSessionService";

function fakeClient(overrides: {
  create?: ReturnType<typeof vi.fn>;
  findUnique?: ReturnType<typeof vi.fn>;
}): PrismaClient {
  return {
    leadSession: {
      create: overrides.create ?? vi.fn(),
      findUnique: overrides.findUnique ?? vi.fn(),
    },
  } as unknown as PrismaClient;
}

describe("PrismaLeadSessionService", () => {
  it("create: persists a cryptographically random, sufficiently long token tied to the given leadId", async () => {
    const createMock = vi.fn().mockResolvedValue(undefined);
    const client = fakeClient({ create: createMock });
    const service = new PrismaLeadSessionService(client);

    const issued = await service.create("lead-1");

    expect(createMock).toHaveBeenCalledTimes(1);
    const data = createMock.mock.calls[0][0].data;
    expect(data.leadId).toBe("lead-1");
    expect(data.token).toBe(issued.token);
    // 32 random bytes hex-encoded -> 64 hex characters.
    expect(issued.token).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("create: never issues the same token twice", async () => {
    const client = fakeClient({ create: vi.fn().mockResolvedValue(undefined) });
    const service = new PrismaLeadSessionService(client);

    const first = await service.create("lead-1");
    const second = await service.create("lead-1");

    expect(first.token).not.toBe(second.token);
  });

  it("resolve: returns the leadId for a known, unexpired token", async () => {
    const findUniqueMock = vi.fn().mockResolvedValue({
      token: "abc",
      leadId: "lead-1",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const client = fakeClient({ findUnique: findUniqueMock });
    const service = new PrismaLeadSessionService(client);

    await expect(service.resolve("abc")).resolves.toBe("lead-1");
  });

  it("resolve: returns null for an unknown token, without throwing", async () => {
    const client = fakeClient({ findUnique: vi.fn().mockResolvedValue(null) });
    const service = new PrismaLeadSessionService(client);

    await expect(service.resolve("does-not-exist")).resolves.toBeNull();
  });

  it("resolve: returns null for an expired token", async () => {
    const findUniqueMock = vi.fn().mockResolvedValue({
      token: "abc",
      leadId: "lead-1",
      expiresAt: new Date(Date.now() - 1000),
    });
    const client = fakeClient({ findUnique: findUniqueMock });
    const service = new PrismaLeadSessionService(client);

    await expect(service.resolve("abc")).resolves.toBeNull();
  });

  it("resolve: returns null for an empty token, without querying the database", async () => {
    const findUniqueMock = vi.fn();
    const client = fakeClient({ findUnique: findUniqueMock });
    const service = new PrismaLeadSessionService(client);

    await expect(service.resolve("")).resolves.toBeNull();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });
});
