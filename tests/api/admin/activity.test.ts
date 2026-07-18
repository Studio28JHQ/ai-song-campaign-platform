import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockList = vi.fn();

vi.mock("@/infrastructure/persistence/prisma/admin/PrismaAdminRecentActivityGate", () => ({
  PrismaAdminRecentActivityGate: vi
    .fn()
    .mockImplementation(function PrismaAdminRecentActivityGate() {
      return { list: mockList };
    }),
}));

const { GET } = await import("../../../app/api/admin/activity/route");

describe("GET /api/admin/activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the recent activity items", async () => {
    mockList.mockResolvedValue([
      {
        type: "lead_registered",
        timestamp: new Date("2026-01-01T00:00:00.000Z"),
        leadId: "lead-1",
        parentName: "Jane Doe",
        babyName: "Baby Doe",
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].type).toBe("lead_registered");
    expect(mockList).toHaveBeenCalledWith(15);
  });

  it("returns 500 on an unexpected failure, without leaking internal detail", async () => {
    mockList.mockRejectedValue(new Error("connection lost"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("connection lost");
  });
});
