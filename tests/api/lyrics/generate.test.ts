import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
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

const mockGenerateAndModerate = vi.fn();

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

vi.mock("@/infrastructure/ai/claude/ClaudeLyricsService", () => ({
  ClaudeLyricsService: vi.fn().mockImplementation(function ClaudeLyricsService() {
    return { generateAndModerate: mockGenerateAndModerate };
  }),
}));

const { POST } = await import("../../../app/api/lyrics/generate/route");

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

const validPayload = {
  leadId: "lead-1",
  moodId: "mood-1",
  moodName: "Joyful",
  moodDescription: "upbeat and cheerful",
  parentMessage: "A gentle bedtime song.",
};

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/lyrics/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/lyrics/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLyricsRepository.findAllByLead.mockResolvedValue([]);
    mockLyricsRepository.create.mockImplementation(async (lyrics: Lyrics) => lyrics);
    mockLeadRepository.update.mockImplementation(async (lead: Lead) => lead);
  });

  it("returns 200 with generated lyrics on approval", async () => {
    const lead = buildLead();
    mockLeadRepository.findById.mockResolvedValue(lead);
    mockGenerateAndModerate.mockResolvedValue({
      approved: true,
      reason: null,
      lyrics: "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus",
    });

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.approved).toBe(true);
    expect(body.lyrics.content).toContain("Title");
    expect(body.remainingAttempts).toBe(5);
  });

  it("returns 200 with approved:false on moderation rejection, without an error status", async () => {
    const lead = buildLead();
    mockLeadRepository.findById.mockResolvedValue(lead);
    mockGenerateAndModerate.mockResolvedValue({
      approved: false,
      reason: "Contains offensive language.",
      lyrics: null,
    });

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.approved).toBe(false);
    expect(body.lyrics).toBeNull();
    expect(body.reason).toBe("Contains offensive language.");
    expect(body.remainingAttempts).toBe(4);
  });

  it("returns 404 when the lead is not found", async () => {
    mockLeadRepository.findById.mockResolvedValue(null);

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("lead_not_found");
    expect(mockGenerateAndModerate).not.toHaveBeenCalled();
  });

  it("returns 422 when the lead has no remaining attempts", async () => {
    const lead = Lead.create(
      {
        campaignId: "campaign-1",
        parentName: "Jane Doe",
        babyName: "Baby Doe",
        email: "jane@example.com",
      },
      1,
    );
    lead.startGenerating();
    lead.consumeAttempt();
    mockLeadRepository.findById.mockResolvedValue(lead);

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("no_remaining_attempts");
    expect(mockGenerateAndModerate).not.toHaveBeenCalled();
  });

  it("returns 503 when Claude is unavailable", async () => {
    const lead = buildLead();
    mockLeadRepository.findById.mockResolvedValue(lead);
    mockGenerateAndModerate.mockRejectedValue(
      new ExternalApiError("Claude API responded with status 503.", { code: "claude.api_error" }),
    );

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("claude_unavailable");
  });

  it("returns 400 for an invalid payload without calling the use case", async () => {
    const response = await POST(postRequest({ ...validPayload, parentMessage: "" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
    expect(mockLeadRepository.findById).not.toHaveBeenCalled();
  });
});
