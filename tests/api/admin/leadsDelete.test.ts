import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAdminSession = vi.fn();
const mockFindDeletionSummary = vi.fn();
const mockDelete = vi.fn();
const mockFindAudioStorageKeys = vi.fn();
const mockR2Delete = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock("@/infrastructure/auth/getAdminSession", () => ({
  getAdminSession: mockGetAdminSession,
}));

vi.mock("@/infrastructure/persistence/prisma/admin/PrismaAdminLeadDeletionGate", () => ({
  PrismaAdminLeadDeletionGate: vi.fn().mockImplementation(function PrismaAdminLeadDeletionGate() {
    return {
      findDeletionSummary: mockFindDeletionSummary,
      findAudioStorageKeys: mockFindAudioStorageKeys,
      delete: mockDelete,
    };
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository", () => ({
  PrismaAuditLogRepository: vi.fn().mockImplementation(function PrismaAuditLogRepository() {
    return { create: mockAuditCreate, findByEntity: vi.fn() };
  }),
}));

// The GET half of this route is wired in the same module; these are
// stubbed so importing it never reaches a real database.
vi.mock("@/infrastructure/persistence/prisma/lead/PrismaLeadRepository", () => ({
  PrismaLeadRepository: vi.fn().mockImplementation(function PrismaLeadRepository() {
    return {};
  }),
}));
vi.mock("@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository", () => ({
  PrismaLyricsRepository: vi.fn().mockImplementation(function PrismaLyricsRepository() {
    return {};
  }),
}));
vi.mock("@/infrastructure/persistence/prisma/song/PrismaSongRepository", () => ({
  PrismaSongRepository: vi.fn().mockImplementation(function PrismaSongRepository() {
    return {};
  }),
}));
vi.mock("@/infrastructure/persistence/prisma/admin/PrismaAdminLyricsAttemptGate", () => ({
  PrismaAdminLyricsAttemptGate: vi.fn().mockImplementation(function PrismaAdminLyricsAttemptGate() {
    return {};
  }),
}));
vi.mock("@/infrastructure/storage/CloudflareR2Storage", () => ({
  CloudflareR2Storage: vi.fn().mockImplementation(function CloudflareR2Storage() {
    return { delete: mockR2Delete };
  }),
}));
vi.mock("@/infrastructure/storage/R2AudioUrlResolver", () => ({
  R2AudioUrlResolver: vi.fn().mockImplementation(function R2AudioUrlResolver() {
    return {};
  }),
}));

const { DELETE } = await import("../../../app/api/admin/leads/[leadId]/route");

const LEAD_ID = "11111111-1111-1111-1111-111111111111";

function context(leadId: string): { params: Promise<{ leadId: string }> } {
  return { params: Promise.resolve({ leadId }) };
}

function request(): Request {
  return new Request(`http://localhost/api/admin/leads/${LEAD_ID}`, { method: "DELETE" });
}

/** Sprint FINAL-5 — Test Data Cleanup. */
describe("DELETE /api/admin/leads/[leadId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue({ adminId: "admin-1", email: "admin@example.com" });
    mockFindDeletionSummary.mockResolvedValue({
      id: LEAD_ID,
      parentName: "Jane Doe",
      babyName: "Baby Doe",
      email: "jane@example.com",
      songCount: 1,
    });
    mockDelete.mockResolvedValue(true);
    mockFindAudioStorageKeys.mockResolvedValue([`songs/${LEAD_ID}.mp3`]);
    mockR2Delete.mockResolvedValue(undefined);
    mockAuditCreate.mockImplementation(async (entry) => entry);
  });

  it("[9] refuses an unauthenticated caller and deletes nothing", async () => {
    mockGetAdminSession.mockResolvedValue(null);

    const response = await DELETE(request(), context(LEAD_ID));

    expect(response.status).toBe(401);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockFindDeletionSummary).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("deletes the family named in the path, and only that one", async () => {
    const response = await DELETE(request(), context(LEAD_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith(LEAD_ID);
    expect(body.deleted).toMatchObject({ id: LEAD_ID, parentName: "Jane Doe", songCount: 1 });
  });

  it("attributes the deletion to the authenticated admin, never to a caller-supplied id", async () => {
    mockGetAdminSession.mockResolvedValue({ adminId: "admin-real", email: "a@example.com" });

    await DELETE(
      new Request(`http://localhost/api/admin/leads/${LEAD_ID}`, {
        method: "DELETE",
        body: JSON.stringify({ adminId: "admin-forged" }),
      }),
      context(LEAD_ID),
    );

    const entry = mockAuditCreate.mock.calls[0][0].toSnapshot();
    expect(entry.adminId).toBe("admin-real");
    expect(entry.action).toBe("delete_lead");
  });

  it("answers 404 for a family that is not there, without reporting success", async () => {
    mockFindDeletionSummary.mockResolvedValue(null);

    const response = await DELETE(request(), context(LEAD_ID));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("lead_not_found");
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("answers 500 with a generic message when the database fails, and keeps the family", async () => {
    mockDelete.mockRejectedValue(new Error("connection reset"));

    const response = await DELETE(request(), context(LEAD_ID));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("internal_error");
    // Nothing about the database reaches the operator.
    expect(body.message).not.toContain("connection reset");
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("rejects an empty id rather than treating it as a wildcard", async () => {
    const response = await DELETE(request(), context(""));

    expect(response.status).toBe(400);
    expect(mockDelete).not.toHaveBeenCalled();
  });
  it("removes the family's audio from storage once the database delete has succeeded", async () => {
    const response = await DELETE(request(), context(LEAD_ID));

    expect(response.status).toBe(200);
    expect(mockR2Delete).toHaveBeenCalledTimes(1);
    expect(mockR2Delete).toHaveBeenCalledWith(`songs/${LEAD_ID}.mp3`);
  });

  it("still answers 200 when storage fails, because the deletion itself succeeded", async () => {
    mockR2Delete.mockRejectedValue(new Error("r2 unavailable"));

    const response = await DELETE(request(), context(LEAD_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deleted.id).toBe(LEAD_ID);
  });

  it("asks storage for nothing when the family had no audio", async () => {
    mockFindAudioStorageKeys.mockResolvedValue([]);

    const response = await DELETE(request(), context(LEAD_ID));

    expect(response.status).toBe(200);
    expect(mockR2Delete).not.toHaveBeenCalled();
  });
});
