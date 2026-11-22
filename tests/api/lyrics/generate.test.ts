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
  findByResumeToken: vi.fn(),
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

const mockGenerateAndModerate = vi.fn();
const mockGetLeadSession = vi.fn();
const mockSendAlertEmail = vi.fn().mockResolvedValue(undefined);

// Operational Alerting. `after()` throws outside a real Next.js request
// scope, so the scheduled callback is captured and run by hand (same
// pattern as tests/api/leads/route.test.ts).
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

vi.mock("@/infrastructure/email/ResendEmailService", () => ({
  ResendEmailService: vi.fn().mockImplementation(function ResendEmailService() {
    return { sendAlertEmail: mockSendAlertEmail };
  }),
}));

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

vi.mock("@/infrastructure/auth/getLeadSession", () => ({
  getLeadSession: mockGetLeadSession,
}));

// Sprint 8.2 — Abuse Protection. Mocked so no real DB/network call
// happens; see dedicated rate-limiting/Turnstile tests for that
// behavior.
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

const mockSiteverify = vi.fn().mockResolvedValue({ success: true });

vi.mock("@/infrastructure/security/turnstile/TurnstileClient", () => ({
  TurnstileClient: vi.fn().mockImplementation(function TurnstileClient() {
    return { siteverify: mockSiteverify };
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
  moodId: "mood-1",
  moodName: "Joyful",
  moodDescription: "upbeat and cheerful",
  parentMessage: "A gentle bedtime song.",
  turnstileToken: "test-turnstile-token",
};

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/lyrics/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A regeneration payload as the client actually sends it — no `turnstileToken` at all. */
function withoutTurnstileToken(): Omit<typeof validPayload, "turnstileToken"> {
  return {
    moodId: validPayload.moodId,
    moodName: validPayload.moodName,
    moodDescription: validPayload.moodDescription,
    parentMessage: validPayload.parentMessage,
  };
}

describe("POST /api/lyrics/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLeadSession.mockResolvedValue("lead-1");
    mockLyricsRepository.findAllByLead.mockResolvedValue([]);
    mockLyricsRepository.findApprovedByLead.mockResolvedValue(null);
    mockLyricsRepository.create.mockImplementation(async (lyrics: Lyrics) => lyrics);
    mockLeadRepository.update.mockImplementation(async (lead: Lead) => lead);
    mockLeadRepository.updateAttemptConsumption.mockImplementation(async (lead: Lead) => lead);
    // `mockReset()` (not just a fresh `mockResolvedValue`) is required
    // here: a prior test's `mockResolvedValueOnce` queued for a call
    // that never actually happened (e.g. a regeneration test, which
    // never calls Turnstile at all) stays queued otherwise, and would
    // leak into whichever later test calls it next.
    mockSiteverify.mockReset().mockResolvedValue({ success: true });
  });

  it("returns 401 when there is no active session, without touching the use case", async () => {
    mockGetLeadSession.mockResolvedValue(null);

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("no_session");
    expect(mockLeadRepository.findById).not.toHaveBeenCalled();
  });

  it("returns a dedicated code/message when Turnstile reports a reused/expired token (timeout-or-duplicate)", async () => {
    mockGetLeadSession.mockResolvedValue("lead-1");
    mockSiteverify.mockResolvedValueOnce({
      success: false,
      "error-codes": ["timeout-or-duplicate"],
    });

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("turnstile_expired_or_reused");
    expect(mockLeadRepository.findById).not.toHaveBeenCalled();
  });

  it("returns the generic verification-failed code for any other Turnstile rejection", async () => {
    mockGetLeadSession.mockResolvedValue("lead-1");
    mockSiteverify.mockResolvedValueOnce({
      success: false,
      "error-codes": ["invalid-input-response"],
    });

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("human_verification_failed");
  });

  it("returns 200 with generated lyrics on approval, identifying the lead via the session only", async () => {
    const lead = buildLead();
    mockLeadRepository.findById.mockResolvedValue(lead);
    mockGetLeadSession.mockResolvedValue(lead.id);
    mockGenerateAndModerate.mockResolvedValue({
      approved: true,
      reason: null,
      lyrics: "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus",
      musicMood: "Warm, joyful and playful.",
      musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
    });

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.approved).toBe(true);
    expect(body.lyrics.content).toContain("Title");
    expect(body.remainingAttempts).toBe(5);
    expect(mockLeadRepository.findById).toHaveBeenCalledWith(lead.id);
  });

  it("defaults voice to FEMALE when the client omits it, and persists it on the Lyrics version (Sprint v1.1 — AI Musical Direction)", async () => {
    const lead = buildLead();
    mockLeadRepository.findById.mockResolvedValue(lead);
    mockGetLeadSession.mockResolvedValue(lead.id);
    mockGenerateAndModerate.mockResolvedValue({
      approved: true,
      reason: null,
      lyrics: "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus",
      musicMood: "Warm, joyful and playful.",
      musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
    });

    await POST(postRequest(validPayload));

    const createdLyrics = mockLyricsRepository.create.mock.calls[0][0] as Lyrics;
    expect(createdLyrics.voice).toBe("FEMALE");
  });

  it("persists an explicitly selected MALE voice on the Lyrics version", async () => {
    const lead = buildLead();
    mockLeadRepository.findById.mockResolvedValue(lead);
    mockGetLeadSession.mockResolvedValue(lead.id);
    mockGenerateAndModerate.mockResolvedValue({
      approved: true,
      reason: null,
      lyrics: "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus",
      musicMood: "Warm, joyful and playful.",
      musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
    });

    await POST(postRequest({ ...validPayload, voice: "MALE" }));

    const createdLyrics = mockLyricsRepository.create.mock.calls[0][0] as Lyrics;
    expect(createdLyrics.voice).toBe("MALE");
  });

  it("returns 200 with approved:false on moderation rejection, without an error status", async () => {
    const lead = buildLead();
    mockLeadRepository.findById.mockResolvedValue(lead);
    mockGetLeadSession.mockResolvedValue(lead.id);
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

  it("returns 400 and rejects an HTML/script payload in parentMessage (Sprint 8.1)", async () => {
    const lead = buildLead();
    mockLeadRepository.findById.mockResolvedValue(lead);

    const response = await POST(
      postRequest({ ...validPayload, parentMessage: "<script>alert(1)</script>" }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
    expect(mockLeadRepository.findById).not.toHaveBeenCalled();
    expect(mockGenerateAndModerate).not.toHaveBeenCalled();
  });

  it("returns 400 for a parentMessage longer than 600 characters (Sprint 8.1)", async () => {
    const response = await POST(postRequest({ ...validPayload, parentMessage: "a".repeat(601) }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
    expect(mockGenerateAndModerate).not.toHaveBeenCalled();
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

  it("returns 422 when the lead already has an approved lyrics version, without calling Claude", async () => {
    const lead = buildLead();
    mockLeadRepository.findById.mockResolvedValue(lead);
    mockLyricsRepository.findApprovedByLead.mockResolvedValue({ id: "lyrics-1" });

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("lyrics_already_approved");
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

  /**
   * Operational Alerting. The alert is scheduled, not sent inline: a
   * parent on a failing request waits for the 503 and nothing else. And
   * the generic 503 body is unchanged — no provider detail, no status
   * code and no billing wording ever reaches the browser, however
   * specific the email is.
   */
  it("schedules an operational alert after the response, without changing what the parent sees", async () => {
    capturedAfterCallbacks.length = 0;
    mockLeadRepository.findById.mockResolvedValue(buildLead());
    mockGenerateAndModerate.mockRejectedValue(
      new ExternalApiError("Claude API responded with status 400.", {
        code: "claude.api_error",
        context: {
          status: 400,
          details: {
            error: { message: "Your credit balance is too low to access the Anthropic API." },
          },
        },
      }),
    );

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "claude_unavailable",
      message:
        "The lyrics generation service is temporarily unavailable. Please try again shortly.",
    });

    // Scheduled exactly once, and nothing sent yet.
    expect(capturedAfterCallbacks).toHaveLength(1);
    expect(mockSendAlertEmail).not.toHaveBeenCalled();

    await capturedAfterCallbacks[0]();

    expect(mockSendAlertEmail).toHaveBeenCalledTimes(1);
    expect(mockSendAlertEmail.mock.calls[0][0]).toMatchObject({
      kind: "LYRICS_PROVIDER_CREDIT_EXHAUSTED",
    });
  });

  it("does not alert on a business-rule rejection — only a real provider failure", async () => {
    capturedAfterCallbacks.length = 0;
    mockSendAlertEmail.mockClear();
    const exhausted = Lead.create(
      {
        campaignId: "campaign-1",
        parentName: "Jane Doe",
        babyName: "Baby Doe",
        email: "jane@example.com",
      },
      1,
    );
    exhausted.startGenerating();
    exhausted.consumeAttempt();
    mockLeadRepository.findById.mockResolvedValue(exhausted);

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(422);
    expect(capturedAfterCallbacks).toHaveLength(0);
    expect(mockSendAlertEmail).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid payload without calling the use case", async () => {
    const response = await POST(postRequest({ ...validPayload, parentMessage: "" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
    expect(mockLeadRepository.findById).not.toHaveBeenCalled();
  });

  it("returns 400 when the payload still carries a leadId (never accepted from the client)", async () => {
    const response = await POST(postRequest({ ...validPayload, leadId: "lead-1" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
  });

  describe("regeneration (a lead that already has a Lyrics version)", () => {
    it("succeeds with no turnstileToken at all — 'Generate another version' has no widget on screen", async () => {
      const lead = buildLead();
      mockLeadRepository.findById.mockResolvedValue(lead);
      mockGetLeadSession.mockResolvedValue(lead.id);
      mockLyricsRepository.findAllByLead.mockResolvedValue([{ id: "lyrics-1" }] as Lyrics[]);
      mockGenerateAndModerate.mockResolvedValue({
        approved: true,
        reason: null,
        lyrics: "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus",
        musicMood: "Warm, joyful and playful.",
        musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
      });

      const payloadWithoutToken = withoutTurnstileToken();
      const response = await POST(postRequest(payloadWithoutToken));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.approved).toBe(true);
      expect(mockSiteverify).not.toHaveBeenCalled();
    });

    it("succeeds even with the original, now-expired/reused token still attached — never verified", async () => {
      const lead = buildLead();
      mockLeadRepository.findById.mockResolvedValue(lead);
      mockGetLeadSession.mockResolvedValue(lead.id);
      mockLyricsRepository.findAllByLead.mockResolvedValue([{ id: "lyrics-1" }] as Lyrics[]);
      // Would fail verification if it were ever checked — proves the
      // route truly skips Turnstile for a regeneration rather than
      // happening to pass.
      mockSiteverify.mockResolvedValueOnce({
        success: false,
        "error-codes": ["timeout-or-duplicate"],
      });
      mockGenerateAndModerate.mockResolvedValue({
        approved: true,
        reason: null,
        lyrics: "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus",
        musicMood: "Warm, joyful and playful.",
        musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
      });

      const response = await POST(postRequest(validPayload));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.approved).toBe(true);
      expect(mockSiteverify).not.toHaveBeenCalled();
    });

    it("supports multiple consecutive regenerations, none of them touching Turnstile", async () => {
      const lead = buildLead();
      mockLeadRepository.findById.mockResolvedValue(lead);
      mockGetLeadSession.mockResolvedValue(lead.id);
      mockLyricsRepository.findAllByLead.mockResolvedValue([
        { id: "lyrics-1" },
        { id: "lyrics-2" },
      ] as Lyrics[]);
      mockGenerateAndModerate.mockResolvedValue({
        approved: true,
        reason: null,
        lyrics: "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus",
        musicMood: "Warm, joyful and playful.",
        musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
      });

      const payloadWithoutToken = withoutTurnstileToken();
      const first = await POST(postRequest(payloadWithoutToken));
      const second = await POST(postRequest(payloadWithoutToken));
      const third = await POST(postRequest(payloadWithoutToken));

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(third.status).toBe(200);
      expect(mockSiteverify).not.toHaveBeenCalled();
    });

    it("still returns 401 for an unauthenticated caller, regardless of any Lyrics history", async () => {
      mockGetLeadSession.mockResolvedValue(null);
      mockLyricsRepository.findAllByLead.mockResolvedValue([{ id: "lyrics-1" }] as Lyrics[]);

      const payloadWithoutToken = withoutTurnstileToken();
      const response = await POST(postRequest(payloadWithoutToken));
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("no_session");
      expect(mockLyricsRepository.findAllByLead).not.toHaveBeenCalled();
    });
  });

  describe("first generation (no existing Lyrics version yet)", () => {
    it("still requires Turnstile — returns 400 when the token is missing entirely", async () => {
      mockLyricsRepository.findAllByLead.mockResolvedValue([]);

      const payloadWithoutToken = withoutTurnstileToken();
      const response = await POST(postRequest(payloadWithoutToken));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("invalid_request");
      expect(mockSiteverify).not.toHaveBeenCalled();
    });

    it("still verifies a present token against Turnstile", async () => {
      const lead = buildLead();
      mockLeadRepository.findById.mockResolvedValue(lead);
      mockGetLeadSession.mockResolvedValue(lead.id);
      mockLyricsRepository.findAllByLead.mockResolvedValue([]);
      mockGenerateAndModerate.mockResolvedValue({
        approved: true,
        reason: null,
        lyrics: "Title\nVerse 1\nChorus\nVerse 2\nFinal Chorus",
        musicMood: "Warm, joyful and playful.",
        musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
      });

      const response = await POST(postRequest(validPayload));

      expect(response.status).toBe(200);
      expect(mockSiteverify).toHaveBeenCalledTimes(1);
    });
  });
});
