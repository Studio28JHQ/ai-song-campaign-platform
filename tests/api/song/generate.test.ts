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

// `after()` throws when called outside a real Next.js request scope (see
// node_modules/next/dist/server/after/after.js), which is exactly the
// situation when a route handler is invoked directly in a test. Capturing
// the scheduled callback here lets us both avoid that crash and
// explicitly await the "background" work to assert on it.
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

function postRequest(body: unknown = {}): Request {
  return new Request("http://localhost/api/song/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function runScheduledBackgroundWork(): Promise<void> {
  const callback = capturedAfterCallbacks.pop();
  if (callback) await callback();
}

describe("POST /api/song/generate", () => {
  let createdSong: Song | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedAfterCallbacks.length = 0;
    createdSong = undefined;
    mockGetLeadSession.mockResolvedValue("lead-1");
    mockSongRepository.findByLead.mockResolvedValue(null);
    mockSongRepository.create.mockImplementation(async (song: Song) => {
      createdSong = song;
      return song;
    });
    // SongGenerationWorker picks up the oldest QUEUED song itself once the
    // background callback runs, so the fake repository must hand back the
    // same instance that GenerateSongUseCase just persisted.
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

  it("returns 401 when there is no active session, without touching the use case", async () => {
    mockGetLeadSession.mockResolvedValue(null);

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("no_session");
    expect(mockLeadRepository.findById).not.toHaveBeenCalled();
  });

  it("returns 202 immediately with QUEUED status, identifying the lead via the session only", async () => {
    const lead = buildLead();
    mockGetLeadSession.mockResolvedValue(lead.id);
    mockLeadRepository.findById.mockResolvedValue(lead);
    const lyrics = buildApprovedLyrics(lead.id);
    mockLyricsRepository.findApprovedByLead.mockResolvedValue(lyrics);

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.status).toBe("QUEUED");
    expect(typeof body.songId).toBe("string");
    expect(body.estimatedNextAction).toBe(
      "The song has entered the generation queue. You will be notified by email once it is ready.",
    );
    expect(mockLeadRepository.findById).toHaveBeenCalledWith(lead.id);
    // Suno must never be called synchronously as part of the request.
    expect(mockGenerateSong).not.toHaveBeenCalled();
  });

  it("schedules background processing that eventually completes the song", async () => {
    const lead = buildLead();
    mockGetLeadSession.mockResolvedValue(lead.id);
    mockLeadRepository.findById.mockResolvedValue(lead);
    const lyrics = buildApprovedLyrics(lead.id);
    mockLyricsRepository.findApprovedByLead.mockResolvedValue(lyrics);
    mockLyricsRepository.findById.mockResolvedValue(lyrics);
    mockGenerateSong.mockResolvedValue({
      providerSongId: "suno-123",
      audioUrl: "https://cdn.example.com/song.mp3",
      duration: 120,
    });

    const response = await POST(postRequest());
    expect(response.status).toBe(202);
    expect(capturedAfterCallbacks).toHaveLength(1);

    await runScheduledBackgroundWork();

    expect(mockGenerateSong).toHaveBeenCalledTimes(1);
    expect(mockSongRepository.update).toHaveBeenCalled();
    const lastUpdateCall = mockSongRepository.update.mock.calls.at(-1)?.[0] as Song;
    expect(lastUpdateCall.status).toBe("COMPLETED");

    // Exactly one email, sent to the lead, once the song completes.
    expect(mockClaimDelivery).toHaveBeenCalledTimes(1);
    expect(mockSendSongReadyEmail).toHaveBeenCalledTimes(1);
    expect(mockSendSongReadyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "jane@example.com",
        audioUrl: "https://cdn.example.com/song.mp3",
      }),
    );
  });

  it("never sends an email when the delivery claim was already taken (duplicate prevention)", async () => {
    const lead = buildLead();
    mockGetLeadSession.mockResolvedValue(lead.id);
    mockLeadRepository.findById.mockResolvedValue(lead);
    const lyrics = buildApprovedLyrics(lead.id);
    mockLyricsRepository.findApprovedByLead.mockResolvedValue(lyrics);
    mockLyricsRepository.findById.mockResolvedValue(lyrics);
    mockGenerateSong.mockResolvedValue({
      providerSongId: "suno-123",
      audioUrl: "https://cdn.example.com/song.mp3",
      duration: 120,
    });
    mockClaimDelivery.mockResolvedValue(false);

    await POST(postRequest());
    await runScheduledBackgroundWork();

    expect(mockClaimDelivery).toHaveBeenCalledTimes(1);
    expect(mockSendSongReadyEmail).not.toHaveBeenCalled();
  });

  it("persists a FAILED status when Suno fails in the background, without crashing, and never sends an email", async () => {
    const lead = buildLead();
    mockGetLeadSession.mockResolvedValue(lead.id);
    mockLeadRepository.findById.mockResolvedValue(lead);
    const lyrics = buildApprovedLyrics(lead.id);
    mockLyricsRepository.findApprovedByLead.mockResolvedValue(lyrics);
    mockLyricsRepository.findById.mockResolvedValue(lyrics);
    mockGenerateSong.mockRejectedValue(new Error("Suno API responded with status 503."));

    const response = await POST(postRequest());
    expect(response.status).toBe(202);

    await expect(runScheduledBackgroundWork()).resolves.toBeUndefined();

    const lastUpdateCall = mockSongRepository.update.mock.calls.at(-1)?.[0] as Song;
    expect(lastUpdateCall.status).toBe("FAILED");
    expect(mockSendSongReadyEmail).not.toHaveBeenCalled();
  });

  it("returns 404 when the lead is not found", async () => {
    mockLeadRepository.findById.mockResolvedValue(null);

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("lead_not_found");
    expect(capturedAfterCallbacks).toHaveLength(0);
  });

  it("returns 422 when the lead has no approved lyrics", async () => {
    const lead = buildLead();
    mockGetLeadSession.mockResolvedValue(lead.id);
    mockLeadRepository.findById.mockResolvedValue(lead);
    mockLyricsRepository.findApprovedByLead.mockResolvedValue(null);

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("lyrics_not_approved");
    expect(capturedAfterCallbacks).toHaveLength(0);
  });

  it("returns 409 when the lead already generated a song", async () => {
    const lead = buildLead();
    mockGetLeadSession.mockResolvedValue(lead.id);
    mockLeadRepository.findById.mockResolvedValue(lead);
    const existingSong = { status: "COMPLETED" } as unknown as Song;
    mockSongRepository.findByLead.mockResolvedValue(existingSong);

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("song_already_exists");
    expect(capturedAfterCallbacks).toHaveLength(0);
  });

  it("returns 422 when the campaign is disabled", async () => {
    const lead = buildLead();
    mockGetLeadSession.mockResolvedValue(lead.id);
    mockLeadRepository.findById.mockResolvedValue(lead);
    mockIsActiveAndGenerationEnabled.mockResolvedValue(false);

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("campaign_disabled");
    expect(capturedAfterCallbacks).toHaveLength(0);
  });

  it("returns 400 for an invalid payload without calling the use case", async () => {
    const response = await POST(postRequest({ leadId: "some-id" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
    expect(mockLeadRepository.findById).not.toHaveBeenCalled();
  });
});
