import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Song } from "@/domain/song/entities/Song";
import { SongStatus } from "@/domain/song/types";

const mockGetAdminSession = vi.fn();
const mockSongFindById = vi.fn();
const mockLeadFindById = vi.fn();
const mockSendSongReadyEmail = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock("@/infrastructure/auth/getAdminSession", () => ({
  getAdminSession: mockGetAdminSession,
}));

vi.mock("@/infrastructure/persistence/prisma/song/PrismaSongRepository", () => ({
  PrismaSongRepository: vi.fn().mockImplementation(function PrismaSongRepository() {
    return { findById: mockSongFindById };
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/lead/PrismaLeadRepository", () => ({
  PrismaLeadRepository: vi.fn().mockImplementation(function PrismaLeadRepository() {
    return { findById: mockLeadFindById };
  }),
}));

vi.mock("@/infrastructure/email/ResendEmailService", () => ({
  ResendEmailService: vi.fn().mockImplementation(function ResendEmailService() {
    return { sendSongReadyEmail: mockSendSongReadyEmail };
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository", () => ({
  PrismaAuditLogRepository: vi.fn().mockImplementation(function PrismaAuditLogRepository() {
    return { create: mockAuditCreate, findByEntity: vi.fn() };
  }),
}));

const { POST } = await import("../../../app/api/admin/songs/[songId]/resend-email/route");

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/songs/song-1/resend-email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function context(songId: string): { params: Promise<{ songId: string }> } {
  return { params: Promise.resolve({ songId }) };
}

function completedEmailedSong(): Song {
  const now = new Date();
  return Song.fromPersistence({
    id: "song-1",
    leadId: "lead-1",
    lyricsId: "lyrics-1",
    moodId: "mood-1",
    provider: "suno",
    providerSongId: "suno-123",
    audioUrl: "https://cdn.example.com/song.mp3",
    duration: 120,
    status: SongStatus.COMPLETED,
    generatedAt: now,
    emailedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

function fakeLead() {
  return {
    email: { toString: () => "jane@example.com" },
    parentName: "Jane Doe",
    babyName: "Baby Doe",
  };
}

describe("POST /api/admin/songs/[songId]/resend-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue({ adminId: "admin-1", email: "admin@example.com" });
    mockAuditCreate.mockImplementation(async (entry: unknown) => entry);
    mockSendSongReadyEmail.mockResolvedValue(undefined);
  });

  it("sends the email and records Resent By/At/Reason for a completed, already-emailed song", async () => {
    mockSongFindById.mockResolvedValue(completedEmailedSong());
    mockLeadFindById.mockResolvedValue(fakeLead());

    const response = await POST(
      postRequest({ reason: "Parent said they never received it." }),
      context("song-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockSendSongReadyEmail).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: "admin-1",
        action: "resend_email",
        entity: "Song",
        entityId: "song-1",
        metadata: { reason: "Parent said they never received it." },
      }),
    );
  });

  it("returns 422 when the song is not completed", async () => {
    const now = new Date();
    mockSongFindById.mockResolvedValue(
      Song.fromPersistence({
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
      }),
    );

    const response = await POST(postRequest({ reason: "test" }), context("song-1"));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("resend_not_allowed");
    expect(mockSendSongReadyEmail).not.toHaveBeenCalled();
  });

  it("returns 422 when the automatic email was never sent", async () => {
    const now = new Date();
    mockSongFindById.mockResolvedValue(
      Song.fromPersistence({
        id: "song-1",
        leadId: "lead-1",
        lyricsId: "lyrics-1",
        moodId: "mood-1",
        provider: "suno",
        providerSongId: "suno-123",
        audioUrl: "https://cdn.example.com/song.mp3",
        duration: 120,
        status: SongStatus.COMPLETED,
        generatedAt: now,
        emailedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const response = await POST(postRequest({ reason: "test" }), context("song-1"));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("resend_not_allowed");
    expect(mockSendSongReadyEmail).not.toHaveBeenCalled();
  });

  it("returns 400 when the reason is missing or empty", async () => {
    const response = await POST(postRequest({ reason: "" }), context("song-1"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
    expect(mockSongFindById).not.toHaveBeenCalled();
  });

  it("returns 404 when the song does not exist", async () => {
    mockSongFindById.mockResolvedValue(null);

    const response = await POST(postRequest({ reason: "test" }), context("missing"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("not_found");
  });

  it("returns 401 when there is no valid admin session", async () => {
    mockGetAdminSession.mockResolvedValue(null);

    const response = await POST(postRequest({ reason: "test" }), context("song-1"));
    expect(response.status).toBe(401);
    expect(mockSongFindById).not.toHaveBeenCalled();
  });

  it("allows sending more than one manual resend over time — each call is independent, unlike the automatic delivery's one-time claim", async () => {
    mockSongFindById.mockResolvedValue(completedEmailedSong());
    mockLeadFindById.mockResolvedValue(fakeLead());

    await POST(postRequest({ reason: "First request." }), context("song-1"));
    await POST(postRequest({ reason: "Second request." }), context("song-1"));

    expect(mockSendSongReadyEmail).toHaveBeenCalledTimes(2);
    expect(mockAuditCreate).toHaveBeenCalledTimes(2);
  });
});
