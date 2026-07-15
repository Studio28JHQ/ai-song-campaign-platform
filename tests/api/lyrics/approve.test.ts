import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import type { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";

const mockLeadRepository: { [K in keyof LeadRepository]: ReturnType<typeof vi.fn> } = {
  findById: vi.fn(),
  findByEmail: vi.fn(),
  existsByEmail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

const mockLyricsRepository: { [K in keyof LyricsRepository]: ReturnType<typeof vi.fn> } = {
  create: vi.fn(),
  findById: vi.fn(),
  findAllByLead: vi.fn(),
  findApprovedByLead: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
};

const mockSongRepository: { [K in keyof SongRepository]: ReturnType<typeof vi.fn> } = {
  create: vi.fn(),
  findById: vi.fn(),
  findByLead: vi.fn(),
  findGenerating: vi.fn(),
  findOldestQueued: vi.fn(),
  update: vi.fn(),
};

const mockIsActiveAndGenerationEnabled = vi.fn();
const mockGetMoodDetails = vi.fn();
const mockGenerateSong = vi.fn();
const mockClaimDelivery = vi.fn();
const mockSendSongReadyEmail = vi.fn();
const mockGetLeadSession = vi.fn();

// `after()` throws when called outside a real Next.js request scope, so
// this test captures the scheduled callback rather than letting it run
// unhandled (same pattern as tests/api/song/generate.test.ts).
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

vi.mock("@/infrastructure/persistence/prisma/lead/PrismaLeadRepository", () => ({
  PrismaLeadRepository: vi.fn().mockImplementation(function PrismaLeadRepository() {
    return mockLeadRepository;
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository", () => ({
  PrismaLyricsRepository: vi.fn().mockImplementation(function PrismaLyricsRepository() {
    return mockLyricsRepository;
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/song/PrismaSongRepository", () => ({
  PrismaSongRepository: vi.fn().mockImplementation(function PrismaSongRepository() {
    return mockSongRepository;
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/song/PrismaCampaignGate", () => ({
  PrismaCampaignGate: vi.fn().mockImplementation(function PrismaCampaignGate() {
    return { isActiveAndGenerationEnabled: mockIsActiveAndGenerationEnabled };
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

vi.mock("@/infrastructure/persistence/prisma/song/PrismaEmailDeliveryTracker", () => ({
  PrismaEmailDeliveryTracker: vi.fn().mockImplementation(function PrismaEmailDeliveryTracker() {
    return { claimDelivery: mockClaimDelivery };
  }),
}));

vi.mock("@/infrastructure/email/ResendEmailService", () => ({
  ResendEmailService: vi.fn().mockImplementation(function ResendEmailService() {
    return { sendSongReadyEmail: mockSendSongReadyEmail };
  }),
}));

vi.mock("@/infrastructure/auth/getLeadSession", () => ({
  getLeadSession: mockGetLeadSession,
}));

// Sprint 8.2 — Abuse Protection. Mocked so no real DB call happens; see
// dedicated rate-limiting tests for that behavior.
vi.mock("@/infrastructure/persistence/prisma/security/PrismaRateLimitRepository", () => ({
  PrismaRateLimitRepository: vi.fn().mockImplementation(function PrismaRateLimitRepository() {
    return {
      countRecentEvents: vi.fn().mockResolvedValue(0),
      recordEvent: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository", () => ({
  PrismaAuditLogRepository: vi.fn().mockImplementation(function PrismaAuditLogRepository() {
    return {
      create: vi.fn().mockResolvedValue(undefined),
      findByEntity: vi.fn().mockResolvedValue([]),
    };
  }),
}));

const { POST } = await import("../../../app/api/lyrics/approve/route");

function buildLead(): Lead {
  return Lead.create(
    {
      campaignId: "campaign-1",
      parentName: "Jane Doe",
      babyName: "Baby Doe",
      email: "jane@example.com",
    },
    5,
  );
}

function buildLyrics(): Lyrics {
  return Lyrics.create({
    leadId: "lead-1",
    moodId: "mood-1",
    prompt: "Mood: Joyful. Parent message: A gentle bedtime song.",
    content: "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus",
    version: 1,
  });
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/lyrics/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function runScheduledBackgroundWork(): Promise<void> {
  const callback = capturedAfterCallbacks.pop();
  if (callback) await callback();
}

describe("POST /api/lyrics/approve", () => {
  let createdSong: Song | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedAfterCallbacks.length = 0;
    createdSong = undefined;
    mockGetLeadSession.mockResolvedValue("lead-1");
    mockLyricsRepository.approve.mockImplementation(async (lyrics: Lyrics) => lyrics);

    const lead = buildLead();
    mockLeadRepository.findById.mockResolvedValue(lead);
    mockSongRepository.findByLead.mockResolvedValue(null);
    mockSongRepository.create.mockImplementation(async (song: Song) => {
      createdSong = song;
      return song;
    });
    mockSongRepository.findGenerating.mockResolvedValue(null);
    mockSongRepository.findOldestQueued.mockImplementation(async () => createdSong ?? null);
    mockSongRepository.update.mockImplementation(async (song: Song) => {
      createdSong = song;
      return song;
    });
    mockIsActiveAndGenerationEnabled.mockResolvedValue(true);
    mockGetMoodDetails.mockResolvedValue({ name: "Joyful", sunoPrompt: "upbeat joyful lullaby" });
    mockClaimDelivery.mockResolvedValue(true);
    mockSendSongReadyEmail.mockResolvedValue(undefined);
  });

  it("returns 401 when there is no active session, without touching the repository", async () => {
    mockGetLeadSession.mockResolvedValue(null);

    const response = await POST(postRequest({ lyricsId: "lyrics-1" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("no_session");
    expect(mockLyricsRepository.findById).not.toHaveBeenCalled();
  });

  it("approves an existing lyrics version and returns it, without waiting for the song provider", async () => {
    const lyrics = buildLyrics();
    mockLyricsRepository.findById.mockResolvedValue(lyrics);
    mockLyricsRepository.findApprovedByLead.mockResolvedValue(lyrics);

    const response = await POST(postRequest({ lyricsId: lyrics.id }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.lyrics.approved).toBe(true);
    // The music provider must never be called synchronously as part of
    // the request — only the background worker calls it.
    expect(mockGenerateSong).not.toHaveBeenCalled();
  });

  it("synchronously creates a QUEUED song job right after approval", async () => {
    const lyrics = buildLyrics();
    mockLyricsRepository.findById.mockResolvedValue(lyrics);
    mockLyricsRepository.findApprovedByLead.mockResolvedValue(lyrics);

    await POST(postRequest({ lyricsId: lyrics.id }));

    expect(mockSongRepository.create).toHaveBeenCalledTimes(1);
    expect(createdSong?.status).toBe("QUEUED");
  });

  it("schedules the background worker, which runs generation through to COMPLETED and sends the email", async () => {
    const lyrics = buildLyrics();
    mockLyricsRepository.findById.mockResolvedValue(lyrics);
    mockLyricsRepository.findApprovedByLead.mockResolvedValue(lyrics);
    mockLyricsRepository.findById.mockResolvedValue(lyrics);
    mockGenerateSong.mockResolvedValue({
      providerSongId: "suno-123",
      audioUrl: "https://cdn.example.com/song.mp3",
      duration: 120,
    });

    const response = await POST(postRequest({ lyricsId: lyrics.id }));
    expect(response.status).toBe(200);
    expect(capturedAfterCallbacks).toHaveLength(1);

    await runScheduledBackgroundWork();

    expect(mockGenerateSong).toHaveBeenCalledTimes(1);
    expect(createdSong?.status).toBe("COMPLETED");
    expect(mockSendSongReadyEmail).toHaveBeenCalledTimes(1);
    expect(mockSendSongReadyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "jane@example.com",
        audioUrl: "https://cdn.example.com/song.mp3",
      }),
    );
  });

  it("returns 404 when the lyrics id does not exist", async () => {
    mockLyricsRepository.findById.mockResolvedValue(null);

    const response = await POST(postRequest({ lyricsId: "missing" }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("lyrics_not_found");
    expect(capturedAfterCallbacks).toHaveLength(0);
  });

  it("returns 422 when the lead already has a different approved version", async () => {
    const lyrics = buildLyrics();
    const otherApproved = Lyrics.create({
      leadId: "lead-1",
      moodId: "mood-1",
      prompt: "prompt",
      content: "Title\n...",
      version: 2,
    });
    otherApproved.approve();

    mockLyricsRepository.findById.mockResolvedValue(lyrics);
    mockLyricsRepository.findApprovedByLead.mockResolvedValue(otherApproved);

    const response = await POST(postRequest({ lyricsId: lyrics.id }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("business_rule_violation");
    expect(capturedAfterCallbacks).toHaveLength(0);
  });

  it("returns 400 for an invalid payload", async () => {
    const response = await POST(postRequest({}));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
    expect(mockLyricsRepository.findById).not.toHaveBeenCalled();
  });
});
