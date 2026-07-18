import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Song } from "@/domain/song/entities/Song";
import { SongStatus } from "@/domain/song/types";

const mockGetAdminSession = vi.fn();
const mockSongFindById = vi.fn();
const mockSongUpdate = vi.fn();
const mockSongFindGenerating = vi.fn();
const mockSongFindOldestQueued = vi.fn();
const mockSongClaimQueued = vi.fn();
const mockAuditCreate = vi.fn();
const mockSubmitGeneration = vi.fn();
const mockPollGenerationStatus = vi.fn();
const mockLyricsFindById = vi.fn();
const mockGetMoodDetails = vi.fn();
const mockLeadFindById = vi.fn();
const mockSendSongReadyEmail = vi.fn();
const mockClaimDelivery = vi.fn();
const mockDownloadAudio = vi.fn();
const mockUploadAudio = vi.fn();
const mockResolveAudioUrl = vi.fn();

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
    return {
      findById: mockSongFindById,
      update: mockSongUpdate,
      findGenerating: mockSongFindGenerating,
      findOldestQueued: mockSongFindOldestQueued,
      claimQueued: mockSongClaimQueued,
    };
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

vi.mock("@/infrastructure/mureka/MurekaSongService", () => ({
  MurekaSongService: vi.fn().mockImplementation(function MurekaSongService() {
    return {
      submitGeneration: mockSubmitGeneration,
      pollGenerationStatus: mockPollGenerationStatus,
    };
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

vi.mock("@/infrastructure/storage/HttpAudioDownloader", () => ({
  HttpAudioDownloader: vi.fn().mockImplementation(function HttpAudioDownloader() {
    return { download: mockDownloadAudio };
  }),
}));

vi.mock("@/infrastructure/storage/CloudflareR2Storage", () => ({
  CloudflareR2Storage: vi.fn().mockImplementation(function CloudflareR2Storage() {
    return { upload: mockUploadAudio };
  }),
}));

vi.mock("@/infrastructure/storage/R2AudioUrlResolver", () => ({
  R2AudioUrlResolver: vi.fn().mockImplementation(function R2AudioUrlResolver() {
    return { resolve: mockResolveAudioUrl };
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
    providerTaskId: null,
    providerTraceId: null,
    providerStatus: null,
    providerError: null,
    audioStorageKey: null,
    duration: null,
    status: SongStatus.FAILED,
    submittedAt: null,
    generatedAt: null,
    completedAt: null,
    emailedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

describe("POST /api/admin/songs/[songId]/retry", () => {
  let updatedSong: Song | undefined;
  // See the identical comment in tests/api/song/generate.test.ts.
  let persistedStatus: SongStatus | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedAfterCallbacks.length = 0;
    updatedSong = undefined;
    persistedStatus = undefined;
    mockGetAdminSession.mockResolvedValue({ adminId: "admin-1", email: "admin@example.com" });
    mockSongUpdate.mockImplementation(async (song: Song) => {
      updatedSong = song;
      persistedStatus = song.status;
      return song;
    });
    mockAuditCreate.mockImplementation(async (entry: unknown) => entry);
    mockSongFindGenerating.mockImplementation(async () =>
      updatedSong?.status === SongStatus.GENERATING ? updatedSong : null,
    );
    mockSongFindOldestQueued.mockImplementation(async () =>
      updatedSong?.status === SongStatus.QUEUED ? updatedSong : null,
    );
    mockSongClaimQueued.mockImplementation(async (song: Song) => {
      if (persistedStatus !== SongStatus.QUEUED) return null;
      updatedSong = song;
      persistedStatus = song.status;
      return song;
    });
  });

  it("returns 202 with QUEUED status for a FAILED song, and schedules background regeneration", async () => {
    mockSongFindById.mockResolvedValue(fakeFailedSong());

    const response = await POST(postRequest(), context("song-1"));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({ songId: "song-1", status: "QUEUED" });
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
    mockLyricsFindById.mockResolvedValue({
      content: "Title\nVerse 1",
      moodId: "mood-1",
      musicMood: "Warm, joyful and playful.",
      musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
      parentMessage: "A gentle song about bedtime.",
      voice: "FEMALE",
    });
    mockGetMoodDetails.mockResolvedValue({ name: "Joyful", sunoPrompt: "upbeat joyful lullaby" });
    mockSubmitGeneration.mockResolvedValue({ providerTaskId: "task-123", providerTraceId: null });
    mockPollGenerationStatus.mockResolvedValue({
      status: "completed",
      providerSongId: "suno-123",
      audioUrl: "https://cdn.example.com/song.mp3",
      duration: 120,
    });
    mockDownloadAudio.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "audio/mpeg",
    });
    mockUploadAudio.mockResolvedValue(undefined);
    mockResolveAudioUrl.mockResolvedValue("https://signed.example.com/songs/song-1.mp3");
    mockClaimDelivery.mockResolvedValue(true);
    mockLeadFindById.mockResolvedValue({
      email: { toString: () => "jane@example.com" },
      parentName: "Jane Doe",
      babyName: "Baby Doe",
    });

    await POST(postRequest(), context("song-1"));
    const callback = capturedAfterCallbacks[0];
    await callback();

    expect(mockSubmitGeneration).toHaveBeenCalledTimes(1);
    expect(mockPollGenerationStatus).toHaveBeenCalledTimes(1);
    // No lyrics-creation call exists anywhere in this dependency graph —
    // only `findById` (a read) is ever invoked.
    expect(mockLyricsFindById).toHaveBeenCalledTimes(1);
  });

  it("returns 422 when the song is not FAILED", async () => {
    mockSongFindById.mockResolvedValue({
      id: "song-1",
      status: "COMPLETED",
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
