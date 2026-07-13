import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import type { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { ExternalApiError } from "@/shared/errors";

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
  update: vi.fn(),
};

const mockIsActiveAndGenerationEnabled = vi.fn();
const mockGetMoodDetails = vi.fn();
const mockGenerateSong = vi.fn();

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

const { POST } = await import("../../../app/api/song/generate/route");

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

function buildApprovedLyrics(leadId: string): Lyrics {
  const lyrics = Lyrics.create({
    leadId,
    moodId: "mood-1",
    prompt: "prompt",
    content: "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus",
    version: 1,
  });
  lyrics.approve();
  return lyrics;
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/song/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/song/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSongRepository.findByLead.mockResolvedValue(null);
    mockSongRepository.create.mockImplementation(async (song: Song) => song);
    mockSongRepository.update.mockImplementation(async (song: Song) => song);
    mockIsActiveAndGenerationEnabled.mockResolvedValue(true);
    mockGetMoodDetails.mockResolvedValue({ name: "Joyful", sunoPrompt: "upbeat joyful lullaby" });
  });

  it("returns 201 with the song id, status, and audio url on success", async () => {
    const lead = buildLead();
    mockLeadRepository.findById.mockResolvedValue(lead);
    mockLyricsRepository.findApprovedByLead.mockResolvedValue(buildApprovedLyrics(lead.id));
    mockGenerateSong.mockResolvedValue({
      providerSongId: "suno-123",
      audioUrl: "https://cdn.example.com/song.mp3",
      duration: 120,
    });

    const response = await POST(postRequest({ leadId: lead.id }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.status).toBe("READY");
    expect(body.audioUrl).toBe("https://cdn.example.com/song.mp3");
    expect(typeof body.songId).toBe("string");
    // Provider internals must never be exposed.
    expect(body.provider).toBeUndefined();
    expect(body.providerSongId).toBeUndefined();
  });

  it("returns 404 when the lead is not found", async () => {
    mockLeadRepository.findById.mockResolvedValue(null);

    const response = await POST(postRequest({ leadId: "missing" }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("lead_not_found");
  });

  it("returns 422 when the lead has no approved lyrics", async () => {
    const lead = buildLead();
    mockLeadRepository.findById.mockResolvedValue(lead);
    mockLyricsRepository.findApprovedByLead.mockResolvedValue(null);

    const response = await POST(postRequest({ leadId: lead.id }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("lyrics_not_approved");
    expect(mockGenerateSong).not.toHaveBeenCalled();
  });

  it("returns 409 when the lead already generated a song", async () => {
    const lead = buildLead();
    mockLeadRepository.findById.mockResolvedValue(lead);
    const existingSong = { status: "READY" } as unknown as Song;
    mockSongRepository.findByLead.mockResolvedValue(existingSong);

    const response = await POST(postRequest({ leadId: lead.id }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("song_already_exists");
    expect(mockGenerateSong).not.toHaveBeenCalled();
  });

  it("returns 422 when the campaign is disabled", async () => {
    const lead = buildLead();
    mockLeadRepository.findById.mockResolvedValue(lead);
    mockIsActiveAndGenerationEnabled.mockResolvedValue(false);

    const response = await POST(postRequest({ leadId: lead.id }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("campaign_disabled");
    expect(mockGenerateSong).not.toHaveBeenCalled();
  });

  it("returns 503 when Suno is unavailable", async () => {
    const lead = buildLead();
    mockLeadRepository.findById.mockResolvedValue(lead);
    mockLyricsRepository.findApprovedByLead.mockResolvedValue(buildApprovedLyrics(lead.id));
    mockGenerateSong.mockRejectedValue(
      new ExternalApiError("Suno API responded with status 503.", { code: "suno.api_error" }),
    );

    const response = await POST(postRequest({ leadId: lead.id }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("suno_unavailable");
  });

  it("returns 400 for an invalid payload without calling the use case", async () => {
    const response = await POST(postRequest({}));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
    expect(mockLeadRepository.findById).not.toHaveBeenCalled();
  });
});
