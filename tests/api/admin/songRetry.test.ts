import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Song } from "@/domain/song/entities/Song";
import { SongStatus } from "@/domain/song/types";

const mockGetAdminSession = vi.fn();
const mockSongFindById = vi.fn();
const mockSongUpdate = vi.fn();
const mockAuditCreate = vi.fn();
const mockTriggerPipelineTick = vi.fn();

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
    };
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository", () => ({
  PrismaAuditLogRepository: vi.fn().mockImplementation(function PrismaAuditLogRepository() {
    return { create: mockAuditCreate, findByEntity: vi.fn() };
  }),
}));

// The route no longer runs GenerationDispatcher/GenerationPoller
// in-process — it only kicks off the self-sustaining pipeline chain
// via `triggerPipelineTick` (see /api/internal/pipeline/run, the only
// place those use cases actually run; covered by
// tests/api/internal/pipelineRun.test.ts).
vi.mock("@/infrastructure/http/triggerPipelineTick", () => ({
  triggerPipelineTick: mockTriggerPipelineTick,
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
  beforeEach(() => {
    vi.clearAllMocks();
    capturedAfterCallbacks.length = 0;
    mockGetAdminSession.mockResolvedValue({ adminId: "admin-1", email: "admin@example.com" });
    mockSongUpdate.mockImplementation(async (song: Song) => song);
    mockAuditCreate.mockImplementation(async (entry: unknown) => entry);
    mockTriggerPipelineTick.mockResolvedValue(undefined);
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

  it("schedules the pipeline trigger in the background, which kicks off the self-sustaining chain", async () => {
    // What actually happens once the chain is kicked off (dispatch,
    // poll, complete, email — reusing the existing lyrics/mood, never
    // regenerating them) is GenerationDispatcher/GenerationPoller's and
    // /api/internal/pipeline/run's responsibility — this route's only
    // job is to place the first call, same as every other call site.
    // See tests/api/internal/pipelineRun.test.ts for the rest of the
    // chain.
    mockSongFindById.mockResolvedValue(fakeFailedSong());

    await POST(postRequest(), context("song-1"));
    const callback = capturedAfterCallbacks[0];
    await callback();

    expect(mockTriggerPipelineTick).toHaveBeenCalledTimes(1);
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
