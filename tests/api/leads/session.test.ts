import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";

const mockLeadRepository: { [K in keyof LeadRepository]: ReturnType<typeof vi.fn> } = {
  findById: vi.fn(),
  findByEmail: vi.fn(),
  existsByEmail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateAttemptConsumption: vi.fn(),
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
  claimQueued: vi.fn(),
};

const mockGetLeadSession = vi.fn();

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

const mockResolveAudioUrl = vi.fn();

vi.mock("@/infrastructure/storage/R2AudioUrlResolver", () => ({
  R2AudioUrlResolver: vi.fn().mockImplementation(function R2AudioUrlResolver() {
    return { resolve: mockResolveAudioUrl };
  }),
}));

const { GET } = await import("../../../app/api/leads/session/route");

function sessionRequest(): Request {
  return new Request("http://localhost/api/leads/session");
}

function buildLead(overrides: Partial<{ babyName: string; remainingAttempts: number }> = {}): Lead {
  return Lead.create(
    {
      campaignId: "campaign-1",
      parentName: "Jane Doe",
      babyName: overrides.babyName ?? "Baby Doe",
      email: "jane@example.com",
    },
    overrides.remainingAttempts ?? 5,
  );
}

describe("GET /api/leads/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAudioUrl.mockImplementation(
      async (key: string) => `https://signed.example.com/${key}`,
    );
  });

  it("returns 401 when there is no active session", async () => {
    mockGetLeadSession.mockResolvedValue(null);

    const response = await GET(sessionRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("no_session");
    expect(mockLeadRepository.findById).not.toHaveBeenCalled();
  });

  it("reconstructs baseline state entirely from the database when nothing has happened yet", async () => {
    const lead = buildLead();
    mockGetLeadSession.mockResolvedValue(lead.id);
    mockLeadRepository.findById.mockResolvedValue(lead);
    mockLyricsRepository.findApprovedByLead.mockResolvedValue(null);
    mockSongRepository.findByLead.mockResolvedValue(null);

    const response = await GET(sessionRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.babyName).toBe("Baby Doe");
    expect(body.remainingAttempts).toBe(5);
    expect(body.approvedLyrics).toBeNull();
    expect(body.song).toBeNull();
  });

  it("includes the approved lyrics and the current song, using the same public vocabulary", async () => {
    const lead = buildLead();
    mockGetLeadSession.mockResolvedValue(lead.id);
    mockLeadRepository.findById.mockResolvedValue(lead);
    mockLyricsRepository.findApprovedByLead.mockResolvedValue({
      id: "lyrics-1",
      content: "Title\n...",
      version: 2,
    });
    mockSongRepository.findByLead.mockResolvedValue({
      id: "song-1",
      status: "COMPLETED",
      audioStorageKey: "songs/song-1.mp3",
      duration: 90,
    });

    const response = await GET(sessionRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.approvedLyrics).toEqual({ id: "lyrics-1", content: "Title\n...", version: 2 });
    expect(body.song).toEqual({
      songId: "song-1",
      status: "COMPLETED",
      audioUrl: "https://signed.example.com/songs/song-1.mp3",
      duration: 90,
    });
  });

  it("never includes a raw Lead id anywhere in the response", async () => {
    const lead = buildLead();
    mockGetLeadSession.mockResolvedValue(lead.id);
    mockLeadRepository.findById.mockResolvedValue(lead);
    mockLyricsRepository.findApprovedByLead.mockResolvedValue(null);
    mockSongRepository.findByLead.mockResolvedValue(null);

    const response = await GET(sessionRequest());
    const body = await response.json();

    expect(JSON.stringify(body)).not.toContain(lead.id);
  });
});
