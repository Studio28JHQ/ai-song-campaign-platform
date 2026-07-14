import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindById = vi.fn();
const mockGetLeadSession = vi.fn();

vi.mock("@/infrastructure/persistence/prisma/song/PrismaSongRepository", () => ({
  PrismaSongRepository: vi.fn().mockImplementation(function PrismaSongRepository() {
    return { findById: mockFindById };
  }),
}));

vi.mock("@/infrastructure/auth/getLeadSession", () => ({
  getLeadSession: mockGetLeadSession,
}));

const { GET } = await import("../../../app/api/song/[songId]/route");

function getRequest(): Request {
  return new Request("http://localhost/api/song/song-1");
}

function context(songId: string): { params: Promise<{ songId: string }> } {
  return { params: Promise.resolve({ songId }) };
}

describe("GET /api/song/[songId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLeadSession.mockResolvedValue("lead-1");
  });

  it("returns 401 when there is no active session, without touching the repository", async () => {
    mockGetLeadSession.mockResolvedValue(null);

    const response = await GET(getRequest(), context("song-1"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("no_session");
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it("returns PENDING status only, without an audioUrl", async () => {
    mockFindById.mockResolvedValue({
      id: "song-1",
      leadId: "lead-1",
      status: "PENDING",
      audioUrl: null,
    });

    const response = await GET(getRequest(), context("song-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ songId: "song-1", status: "PENDING" });
  });

  it("returns GENERATING status only, without an audioUrl", async () => {
    mockFindById.mockResolvedValue({
      id: "song-1",
      leadId: "lead-1",
      status: "GENERATING",
      audioUrl: null,
    });

    const response = await GET(getRequest(), context("song-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ songId: "song-1", status: "GENERATING" });
  });

  it("returns COMPLETED status with the audioUrl and duration when the song is READY", async () => {
    mockFindById.mockResolvedValue({
      id: "song-1",
      leadId: "lead-1",
      status: "READY",
      audioUrl: "https://cdn.example.com/song.mp3",
      duration: 120,
    });

    const response = await GET(getRequest(), context("song-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      songId: "song-1",
      status: "COMPLETED",
      audioUrl: "https://cdn.example.com/song.mp3",
      duration: 120,
    });
  });

  it("returns FAILED status only, without an audioUrl", async () => {
    mockFindById.mockResolvedValue({
      id: "song-1",
      leadId: "lead-1",
      status: "FAILED",
      audioUrl: null,
    });

    const response = await GET(getRequest(), context("song-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ songId: "song-1", status: "FAILED" });
  });

  it("returns 404 when the song does not exist", async () => {
    mockFindById.mockResolvedValue(null);

    const response = await GET(getRequest(), context("missing"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("song_not_found");
  });

  it("returns 404 (not 403) when the song belongs to a different lead — never confirming it exists", async () => {
    mockFindById.mockResolvedValue({
      id: "song-1",
      leadId: "someone-elses-lead",
      status: "COMPLETED",
      audioUrl: "https://cdn.example.com/song.mp3",
    });

    const response = await GET(getRequest(), context("song-1"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("song_not_found");
  });

  it("returns 400 when the songId param is empty", async () => {
    const response = await GET(getRequest(), context(""));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
    expect(mockFindById).not.toHaveBeenCalled();
  });
});
