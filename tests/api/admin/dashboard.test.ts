import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSummary = vi.fn();

vi.mock("@/infrastructure/persistence/prisma/admin/PrismaAdminDashboardGate", () => ({
  PrismaAdminDashboardGate: vi.fn().mockImplementation(function PrismaAdminDashboardGate() {
    return { getSummary: mockGetSummary };
  }),
}));

const { GET } = await import("../../../app/api/admin/dashboard/route");

describe("GET /api/admin/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the nine summary indicators, including the computed success rate", async () => {
    mockGetSummary.mockResolvedValue({
      totalLeads: 12,
      lyricsGenerated: 15,
      lyricsApproved: 10,
      songsRequested: 8,
      songsCompleted: 4,
      songsFailed: 3,
      emailsSent: 4,
      emailsResent: 2,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      totalLeads: 12,
      lyricsGenerated: 15,
      lyricsApproved: 10,
      songsRequested: 8,
      songsCompleted: 4,
      songsFailed: 3,
      emailsSent: 4,
      emailsResent: 2,
      generationSuccessRate: 50,
    });
  });

  it("returns 500 on an unexpected failure, without leaking internal detail", async () => {
    mockGetSummary.mockRejectedValue(new Error("connection lost"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("connection lost");
  });
});
