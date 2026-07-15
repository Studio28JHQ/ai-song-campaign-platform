import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "@/config/app";

const mockSongFindGenerating = vi.fn();
const mockSongFindOldestQueued = vi.fn();
const mockSongUpdate = vi.fn();
const mockSongFindById = vi.fn();
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

vi.mock("@/infrastructure/suno/SunoSongService", () => ({
  SunoSongService: vi.fn().mockImplementation(function SunoSongService() {
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

  it("returns 500 when the pipeline throws an unexpected error", async () => {
    mockSongFindGenerating.mockRejectedValue(new Error("database unreachable"));

    const response = await GET(getRequest(appConfig.internal.cronSecret));

    expect(response.status).toBe(500);
  });
});
