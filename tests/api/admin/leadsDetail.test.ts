import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAdminSession = vi.fn();
const mockLeadFindById = vi.fn();
const mockLyricsFindAllByLead = vi.fn();
const mockLyricsFindApprovedByLead = vi.fn();
const mockSongFindByLead = vi.fn();
const mockAuditCreate = vi.fn();
const mockAuditFindByEntity = vi.fn();

vi.mock("@/infrastructure/auth/getAdminSession", () => ({
  getAdminSession: mockGetAdminSession,
}));

vi.mock("@/infrastructure/persistence/prisma/lead/PrismaLeadRepository", () => ({
  PrismaLeadRepository: vi.fn().mockImplementation(function PrismaLeadRepository() {
    return { findById: mockLeadFindById };
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository", () => ({
  PrismaLyricsRepository: vi.fn().mockImplementation(function PrismaLyricsRepository() {
    return {
      findAllByLead: mockLyricsFindAllByLead,
      findApprovedByLead: mockLyricsFindApprovedByLead,
    };
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/song/PrismaSongRepository", () => ({
  PrismaSongRepository: vi.fn().mockImplementation(function PrismaSongRepository() {
    return { findByLead: mockSongFindByLead };
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository", () => ({
  PrismaAuditLogRepository: vi.fn().mockImplementation(function PrismaAuditLogRepository() {
    return { create: mockAuditCreate, findByEntity: mockAuditFindByEntity };
  }),
}));

const { GET } = await import("../../../app/api/admin/leads/[leadId]/route");

function context(leadId: string): { params: Promise<{ leadId: string }> } {
  return { params: Promise.resolve({ leadId }) };
}

function fakeLead() {
  return {
    id: "lead-1",
    toSnapshot: () => ({ id: "lead-1", parentName: "Jane Doe", babyName: "Baby Doe" }),
  };
}

describe("GET /api/admin/leads/[leadId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue({ adminId: "admin-1", email: "admin@example.com" });
    mockLyricsFindAllByLead.mockResolvedValue([]);
    mockLyricsFindApprovedByLead.mockResolvedValue(null);
    mockSongFindByLead.mockResolvedValue(null);
    mockAuditCreate.mockImplementation(async (entry) => entry);
    mockAuditFindByEntity.mockResolvedValue([]);
  });

  it("returns the composed lead detail for an authenticated admin", async () => {
    mockLeadFindById.mockResolvedValue(fakeLead());

    const response = await GET(
      new Request("http://localhost/api/admin/leads/lead-1"),
      context("lead-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.lead.id).toBe("lead-1");
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when the lead does not exist", async () => {
    mockLeadFindById.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/admin/leads/missing"),
      context("missing"),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("lead_not_found");
  });

  it("returns 401 when there is no valid admin session (defense in depth)", async () => {
    mockGetAdminSession.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/admin/leads/lead-1"),
      context("lead-1"),
    );
    expect(response.status).toBe(401);
    expect(mockLeadFindById).not.toHaveBeenCalled();
  });

  it("returns 400 when the leadId param is empty", async () => {
    const response = await GET(new Request("http://localhost/api/admin/leads/"), context(""));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
  });
});
