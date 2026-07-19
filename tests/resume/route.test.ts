import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindByResumeToken = vi.fn();
const mockFindApprovedByLead = vi.fn();
const mockCreateSession = vi.fn();

vi.mock("@/infrastructure/persistence/prisma/lead/PrismaLeadRepository", () => ({
  PrismaLeadRepository: vi.fn().mockImplementation(function PrismaLeadRepository() {
    return { findByResumeToken: mockFindByResumeToken };
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository", () => ({
  PrismaLyricsRepository: vi.fn().mockImplementation(function PrismaLyricsRepository() {
    return { findApprovedByLead: mockFindApprovedByLead };
  }),
}));

vi.mock("@/infrastructure/auth/PrismaLeadSessionService", () => ({
  PrismaLeadSessionService: vi.fn().mockImplementation(function PrismaLeadSessionService() {
    return { create: mockCreateSession, resolve: vi.fn() };
  }),
}));

const { GET } = await import("../../app/resume/[token]/route");

function context(token: string): { params: Promise<{ token: string }> } {
  return { params: Promise.resolve({ token }) };
}

function request(token: string): Request {
  return new Request(`http://localhost/resume/${token}`);
}

describe("GET /resume/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSession.mockResolvedValue({
      token: "session-token",
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
    });
  });

  it("redirects to /generate and issues a session when the lead has no approved lyrics yet", async () => {
    mockFindByResumeToken.mockResolvedValue({ id: "lead-1" });
    mockFindApprovedByLead.mockResolvedValue(null);

    const response = await GET(request("valid-token"), context("valid-token"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/generate");
    expect(mockCreateSession).toHaveBeenCalledWith("lead-1");
    const setCookieHeader = response.headers.get("set-cookie");
    expect(setCookieHeader).toContain("lead_session=session-token");
    expect(setCookieHeader).toMatch(/HttpOnly/i);
  });

  it("redirects to /song once lyrics are approved (song generating or completed)", async () => {
    mockFindByResumeToken.mockResolvedValue({ id: "lead-1" });
    mockFindApprovedByLead.mockResolvedValue({ id: "lyrics-1" });

    const response = await GET(request("valid-token"), context("valid-token"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/song");
  });

  it("redirects home for an unknown token, without issuing a session or exposing why", async () => {
    mockFindByResumeToken.mockResolvedValue(null);

    const response = await GET(request("unknown-token"), context("unknown-token"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("redirects home (never crashes) on an unexpected lookup failure", async () => {
    mockFindByResumeToken.mockRejectedValue(new Error("connection reset by peer"));

    const response = await GET(request("valid-token"), context("valid-token"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
  });

  it("is reusable — the same token resolves correctly again on a second, independent visit", async () => {
    mockFindByResumeToken.mockResolvedValue({ id: "lead-1" });
    mockFindApprovedByLead.mockResolvedValue(null);

    const first = await GET(request("valid-token"), context("valid-token"));
    const second = await GET(request("valid-token"), context("valid-token"));

    expect(first.headers.get("location")).toBe("http://localhost/generate");
    expect(second.headers.get("location")).toBe("http://localhost/generate");
    expect(mockCreateSession).toHaveBeenCalledTimes(2);
  });
});
