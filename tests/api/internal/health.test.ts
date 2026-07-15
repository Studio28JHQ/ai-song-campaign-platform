import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "@/config/app";

const mockCheck = vi.fn();

vi.mock("@/infrastructure/health/HealthCheckService", () => ({
  HealthCheckService: vi.fn().mockImplementation(function HealthCheckService() {
    return { check: mockCheck };
  }),
}));

const { GET } = await import("../../../app/api/internal/health/route");

function getRequest(token?: string): Request {
  return new Request("http://localhost/api/internal/health", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

const allHealthy = {
  database: { status: "ok" },
  r2: { status: "ok" },
  resend: { status: "ok" },
  mureka: { status: "ok" },
};

describe("GET /api/internal/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 with no Authorization header, and never runs the checks", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("returns 401 with the wrong secret", async () => {
    const response = await GET(getRequest("wrong-secret-wrong-secret-wrong-secret"));
    expect(response.status).toBe(401);
  });

  it("returns 200 with the full status body when every dependency is healthy", async () => {
    mockCheck.mockResolvedValue(allHealthy);

    const response = await GET(getRequest(appConfig.internal.cronSecret));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(allHealthy);
  });

  it("returns 503 when any one dependency is unhealthy", async () => {
    mockCheck.mockResolvedValue({
      ...allHealthy,
      mureka: { status: "error", message: "Mureka API responded with status 401." },
    });

    const response = await GET(getRequest(appConfig.internal.cronSecret));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.mureka.status).toBe("error");
    expect(body.database.status).toBe("ok");
  });
});
