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
const mockTriggerPipelineTick = vi.fn();

// Polling reliability fix: this route reschedules itself via `after()`
// (a self-call through `triggerPipelineTick`) whenever a tick actually
// touched a song, so a submitted song keeps progressing to a terminal
// state without depending on another request. Both are mocked so the
// reschedule can be asserted without a real timer wait or network call.
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

vi.mock("@/shared/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/utils")>();
  return { ...actual, sleep: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("@/infrastructure/http/triggerPipelineTick", () => ({
  triggerPipelineTick: mockTriggerPipelineTick,
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
    capturedAfterCallbacks.length = 0;
    mockSongFindGenerating.mockResolvedValue(null);
    mockSongFindOldestQueued.mockResolvedValue(null);
    mockTriggerPipelineTick.mockResolvedValue(undefined);
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

  it("does not reschedule another tick when the queue is empty and nothing is generating", async () => {
    await GET(getRequest(appConfig.internal.cronSecret));

    expect(capturedAfterCallbacks).toHaveLength(0);
  });

  it("reschedules exactly one more tick, via triggerPipelineTick, when a song is still GENERATING", async () => {
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

    expect(response.status).toBe(200);
    expect(capturedAfterCallbacks).toHaveLength(1);
    expect(mockTriggerPipelineTick).not.toHaveBeenCalled();

    await capturedAfterCallbacks[0]();

    expect(mockTriggerPipelineTick).toHaveBeenCalledTimes(1);
  });

  it("reschedules another tick when the dispatcher just claimed a queued song, so it gets polled next", async () => {
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
    expect(mockSongClaimQueued).toHaveBeenCalledTimes(1);
    expect(capturedAfterCallbacks).toHaveLength(1);

    await capturedAfterCallbacks[0]();

    expect(mockTriggerPipelineTick).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when the pipeline throws an unexpected error", async () => {
    mockSongFindGenerating.mockRejectedValue(new Error("database unreachable"));

    const response = await GET(getRequest(appConfig.internal.cronSecret));

    expect(response.status).toBe(500);
  });
});
