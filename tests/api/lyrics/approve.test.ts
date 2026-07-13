import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";

const mockLyricsRepository: { [K in keyof LyricsRepository]: ReturnType<typeof vi.fn> } = {
  create: vi.fn(),
  findById: vi.fn(),
  findAllByLead: vi.fn(),
  findApprovedByLead: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
};

vi.mock("@/infrastructure/persistence/prisma/lyrics/PrismaLyricsRepository", () => ({
  PrismaLyricsRepository: vi.fn().mockImplementation(function PrismaLyricsRepository() {
    return mockLyricsRepository;
  }),
}));

const { POST } = await import("../../../app/api/lyrics/approve/route");

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

describe("POST /api/lyrics/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLyricsRepository.approve.mockImplementation(async (lyrics: Lyrics) => lyrics);
  });

  it("approves an existing lyrics version", async () => {
    const lyrics = buildLyrics();
    mockLyricsRepository.findById.mockResolvedValue(lyrics);
    mockLyricsRepository.findApprovedByLead.mockResolvedValue(null);

    const response = await POST(postRequest({ lyricsId: lyrics.id }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.lyrics.approved).toBe(true);
  });

  it("returns 404 when the lyrics id does not exist", async () => {
    mockLyricsRepository.findById.mockResolvedValue(null);

    const response = await POST(postRequest({ lyricsId: "missing" }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("lyrics_not_found");
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
  });

  it("returns 400 for an invalid payload", async () => {
    const response = await POST(postRequest({}));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
    expect(mockLyricsRepository.findById).not.toHaveBeenCalled();
  });
});
