import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "@/config/app";
import { Song } from "@/domain/song/entities/Song";
import { SongStatus } from "@/domain/song/types";

const mockSongFindGenerating = vi.fn();
const mockSongFindOldestQueued = vi.fn();
const mockSongUpdate = vi.fn();
const mockSongFindById = vi.fn();
const mockSongClaimQueued = vi.fn();
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

const { GET } = await import("../../../app/api/internal/pipeline/run/route");

function getRequest(token?: string): Request {
  return new Request("http://localhost/api/internal/pipeline/run", {
    method: "GET",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("GET /api/internal/pipeline/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSongFindGenerating.mockResolvedValue(null);
    mockSongFindOldestQueued.mockResolvedValue(null);
  });

  it("returns 401 with no Authorization header", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
    expect(mockSongFindGenerating).not.toHaveBeenCalled();
  });

  it("returns 401 with the wrong secret", async () => {
    const response = await GET(getRequest("wrong-secret-wrong-secret-wrong-secret"));
    expect(response.status).toBe(401);
    expect(mockSongFindGenerating).not.toHaveBeenCalled();
  });

  it("returns 200 and runs the dispatcher then the poller exactly once with the correct secret", async () => {
    const response = await GET(getRequest(appConfig.internal.cronSecret));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ dispatcher: null, poller: null });
    expect(mockSongFindGenerating).toHaveBeenCalledTimes(2); // dispatcher + poller's findGenerating call each run once
  });

  it("polls a song still GENERATING exactly once, without scheduling anything further", async () => {
    const now = new Date();
    const generatingSong = Song.fromPersistence({
      id: "song-1",
      leadId: "lead-1",
      lyricsId: "lyrics-1",
      moodId: "mood-1",
      provider: "mureka",
      providerSongId: null,
      providerTaskId: "task-123",
      providerTraceId: null,
      providerStatus: "preparing",
      providerError: null,
      audioStorageKey: null,
      duration: null,
      status: SongStatus.GENERATING,
      submittedAt: now,
      generatedAt: null,
      completedAt: null,
      emailedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    mockSongFindGenerating.mockResolvedValue(generatingSong);
    mockPollGenerationStatus.mockResolvedValue({ status: "pending", providerStatus: "preparing" });
    mockSongUpdate.mockImplementation(async (song: Song) => song);

    const response = await GET(getRequest(appConfig.internal.cronSecret));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.poller).toEqual({ songId: "song-1", outcome: "pending" });
    expect(mockPollGenerationStatus).toHaveBeenCalledTimes(1);
  });

  it("dispatches a queued song exactly once per invocation — completing it requires the next scheduled tick, not this same call", async () => {
    const now = new Date();
    const queuedSong = Song.fromPersistence({
      id: "song-1",
      leadId: "lead-1",
      lyricsId: "lyrics-1",
      moodId: "mood-1",
      provider: "mureka",
      providerSongId: null,
      providerTaskId: null,
      providerTraceId: null,
      providerStatus: null,
      providerError: null,
      audioStorageKey: null,
      duration: null,
      status: SongStatus.QUEUED,
      submittedAt: null,
      generatedAt: null,
      completedAt: null,
      emailedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    mockSongFindOldestQueued.mockResolvedValue(queuedSong);
    mockSongClaimQueued.mockImplementation(async (song: Song) => song);
    mockSongUpdate.mockImplementation(async (song: Song) => song);
    mockLyricsFindById.mockResolvedValue({
      musicMood: "Warm, joyful and playful.",
      musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
      content: "Title\nVerse 1",
      voice: "FEMALE",
    });
    mockGetMoodDetails.mockResolvedValue({ name: "Joyful", sunoPrompt: "upbeat joyful lullaby" });
    mockSubmitGeneration.mockResolvedValue({ providerTaskId: "task-123", providerTraceId: null });

    const response = await GET(getRequest(appConfig.internal.cronSecret));

    expect(response.status).toBe(200);
    // Claimed and submitted exactly once — never twice for the same
    // song, and this invocation never polls the song it just claimed
    // (that's the next tick's job, whenever the scheduler runs it).
    expect(mockSongClaimQueued).toHaveBeenCalledTimes(1);
    expect(mockSubmitGeneration).toHaveBeenCalledTimes(1);
    expect(mockPollGenerationStatus).not.toHaveBeenCalled();
  });

  it("returns 500 when the pipeline throws an unexpected error", async () => {
    mockSongFindGenerating.mockRejectedValue(new Error("database unreachable"));

    const response = await GET(getRequest(appConfig.internal.cronSecret));

    expect(response.status).toBe(500);
  });
});
