import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudflareR2Storage } from "@/infrastructure/storage/CloudflareR2Storage";
import type { ResendClient } from "@/infrastructure/email/ResendClient";
import type { MurekaClient } from "@/infrastructure/mureka/MurekaClient";
import { HealthCheckService } from "@/infrastructure/health/HealthCheckService";

const { mockQueryRaw } = vi.hoisted(() => ({ mockQueryRaw: vi.fn() }));

vi.mock("@/infrastructure/persistence/prisma/client", () => ({
  prisma: { $queryRaw: mockQueryRaw },
}));

function fakeR2(error?: Error): CloudflareR2Storage {
  return {
    exists: error ? vi.fn().mockRejectedValue(error) : vi.fn().mockResolvedValue(false),
  } as unknown as CloudflareR2Storage;
}

function fakeResend(error?: Error): ResendClient {
  return {
    checkHealth: error ? vi.fn().mockRejectedValue(error) : vi.fn().mockResolvedValue(undefined),
  } as unknown as ResendClient;
}

function fakeMureka(error?: Error): MurekaClient {
  return {
    getAccountBilling: error
      ? vi.fn().mockRejectedValue(error)
      : vi.fn().mockResolvedValue({ account_id: 1 }),
  } as unknown as MurekaClient;
}

describe("HealthCheckService", () => {
  beforeEach(() => {
    mockQueryRaw.mockReset().mockResolvedValue([{ "?column?": 1 }]);
  });

  it("reports the database as error when the query fails, others still ok", async () => {
    mockQueryRaw.mockRejectedValue(new Error("connection refused"));
    const service = new HealthCheckService(fakeR2(), fakeResend(), fakeMureka());

    const result = await service.check();

    expect(result.database).toEqual({ status: "error", message: "connection refused" });
    expect(result.r2.status).toBe("ok");
    expect(result.resend.status).toBe("ok");
    expect(result.mureka.status).toBe("ok");
  });

  it("reports every dependency as ok when all checks succeed", async () => {
    const service = new HealthCheckService(fakeR2(), fakeResend(), fakeMureka());

    const result = await service.check();

    expect(result).toEqual({
      database: { status: "ok" },
      r2: { status: "ok" },
      resend: { status: "ok" },
      mureka: { status: "ok" },
    });
  });

  it("reports only the failing dependency as error, with its message, others still ok", async () => {
    const service = new HealthCheckService(
      fakeR2(),
      fakeResend(new Error("Resend API responded with status 401.")),
      fakeMureka(),
    );

    const result = await service.check();

    expect(result.resend).toEqual({
      status: "error",
      message: "Resend API responded with status 401.",
    });
    expect(result.database.status).toBe("ok");
    expect(result.r2.status).toBe("ok");
    expect(result.mureka.status).toBe("ok");
  });

  it("reports every dependency independently when all fail", async () => {
    const service = new HealthCheckService(
      fakeR2(new Error("r2 down")),
      fakeResend(new Error("resend down")),
      fakeMureka(new Error("mureka down")),
    );

    const result = await service.check();

    expect(result.r2.status).toBe("error");
    expect(result.resend.status).toBe("error");
    expect(result.mureka.status).toBe("error");
  });
});
