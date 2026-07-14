import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Song } from "@/domain/song/entities/Song";
import { SongStatus } from "@/domain/song/types";

const mockGetAdminSession = vi.fn();
const mockSongFindById = vi.fn();
const mockSongUpdate = vi.fn();
const mockAuditCreate = vi.fn();
const mockGenerateSong = vi.fn();
const mockLyricsFindById = vi.fn();
const mockGetMoodDetails = vi.fn();
const mockLeadFindById = vi.fn();
const mockSendSongReadyEmail = vi.fn();
const mockClaimDelivery = vi.fn();

const capturedAfterCallbacks: Array<() => Promise<void>> = [];

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((callback: () => Promise<void>) => {
      capturedAfterCallbacks.push(callback);
    }),
  };
});

vi.mock("@/infrastructure/auth/getAdminSession", () => ({
  getAdminSession: mockGetAdminSession,
}));

vi.mock("@/infrastructure/persistence/prisma/song/PrismaSongRepository", () => ({
  PrismaSongRepository: vi.fn().mockImplementation(function PrismaSongRepository() {
    return { findById: mockSongFindById, update: mockSongUpdate };
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository", () => ({
  PrismaAuditLogRepository: vi.fn().mockImplementation(function PrismaAuditLogRepository() {
    return { create: mockAuditCreate, findByEntity: vi.fn() };
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository", () => ({
  PrismaLyricsRepository: vi.fn().mockImplementation(function PrismaLyricsRepository() {
    return { findById: mockLyricsFindById };
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/lead/PrismaLeadRepository", () => ({
  PrismaLeadRepository: vi.fn().mockImplementation(function PrismaLeadRepository() {
    return { findById: mockLeadFindById };
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/song/PrismaMoodSunoPromptProvider", () => ({
  PrismaMoodSunoPromptProvider: vi.fn().mockImplementation(function PrismaMoodSunoPromptProvider() {
    return { getMoodDetails: mockGetMoodDetails };
  }),
}));

vi.mock("@/infrastructure/suno/SunoSongService", () => ({
  SunoSongService: vi.fn().mockImplementation(function SunoSongService() {
    return { generateSong: mockGenerateSong };
  }),
}));

vi.mock("@/infrastructure/email/ResendEmailService", () => ({
  ResendEmailService: vi.fn().mockImplementation(function ResendEmailService() {
    return { sendSongReadyEmail: mockSendSongReadyEmail };
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/song/PrismaEmailDeliveryTracker", () => ({
  PrismaEmailDeliveryTracker: vi.fn().mockImplementation(function PrismaEmailDeliveryTracker() {
    return { claimDelivery: mockClaimDelivery };
  }),
}));

const { POST } = await import("../../../app/api/admin/songs/[songId]/retry/route");

function postRequest(): Request {
  return new Request("http://localhost/api/admin/songs/song-1/retry", { method: "POST" });
}

function context(songId: string): { params: Promise<{ songId: string }> } {
  return { params: Promise.resolve({ songId }) };
}

function fakeFailedSong(): Song {
  const now = new Date();
  return Song.fromPersistence({
    id: "song-1",
    leadId: "lead-1",
    lyricsId: "lyrics-1",
    moodId: "mood-1",
    provider: "suno",
    providerSongId: null,
    audioUrl: null,
    duration: null,
    status: SongStatus.FAILED,
    generatedAt: null,
    emailedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

describe("POST /api/admin/songs/[songId]/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedAfterCallbacks.length = 0;
    mockGetAdminSession.mockResolvedValue({ adminId: "admin-1", email: "admin@example.com" });
    mockSongUpdate.mockImplementation(async (song: unknown) => song);
    mockAuditCreate.mockImplementation(async (entry: unknown) => entry);
  });

  it("returns 202 with PENDING status for a FAILED song, and schedules background regeneration", async () => {
    mockSongFindById.mockResolvedValue(fakeFailedSong());

    const response = await POST(postRequest(), context("song-1"));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({ songId: "song-1", status: "PENDING" });
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: "admin-1",
        action: "retry_song",
        entity: "Song",
        entityId: "song-1",
      }),
    );
    expect(capturedAfterCallbacks).toHaveLength(1);
  });

  it("reuses the existing lyrics/mood and never regenerates lyrics when the background job runs", async () => {
    mockSongFindById.mockResolvedValue(fakeFailedSong());
    mockLyricsFindById.mockResolvedValue({ content: "Title\nVerse 1", moodId: "mood-1" });
    mockGetMoodDetails.mockResolvedValue({ name: "Joyful", sunoPrompt: "upbeat joyful lullaby" });
    mockGenerateSong.mockResolvedValue({
      providerSongId: "suno-123",
      audioUrl: "https://cdn.example.com/song.mp3",
      duration: 120,
    });
    mockClaimDelivery.mockResolvedValue(true);
    mockLeadFindById.mockResolvedValue({
      email: { toString: () => "jane@example.com" },
      parentName: "Jane Doe",
      babyName: "Baby Doe",
    });

    await POST(postRequest(), context("song-1"));
    const callback = capturedAfterCallbacks[0];
    await callback();

    expect(mockGenerateSong).toHaveBeenCalledTimes(1);
    // No lyrics-creation call exists anywhere in this dependency graph —
    // only `findById` (a read) is ever invoked.
    expect(mockLyricsFindById).toHaveBeenCalledTimes(1);
  });

  it("returns 422 when the song is not FAILED", async () => {
    mockSongFindById.mockResolvedValue({
      id: "song-1",
      status: "READY",
      retryFromFailure: vi.fn(() => {
        throw new Error("should not be called");
      }),
    });

    const response = await POST(postRequest(), context("song-1"));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("retry_not_allowed");
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("returns 404 when the song does not exist", async () => {
    mockSongFindById.mockResolvedValue(null);

    const response = await POST(postRequest(), context("missing"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("song_not_found");
  });

  it("returns 401 when there is no valid admin session", async () => {
    mockGetAdminSession.mockResolvedValue(null);

    const response = await POST(postRequest(), context("song-1"));
    expect(response.status).toBe(401);
    expect(mockSongFindById).not.toHaveBeenCalled();
  });

  it("returns 400 when the songId param is empty", async () => {
    const response = await POST(postRequest(), context(""));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
  });
});
