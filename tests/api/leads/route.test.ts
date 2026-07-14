import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";

const mockRepository: {
  [K in keyof LeadRepository]: ReturnType<typeof vi.fn>;
} = {
  findById: vi.fn(),
  findByEmail: vi.fn(),
  existsByEmail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

const mockCreateSession = vi.fn();

vi.mock("@/infrastructure/persistence/prisma/lead/PrismaLeadRepository", () => ({
  PrismaLeadRepository: vi.fn().mockImplementation(function PrismaLeadRepository() {
    return mockRepository;
  }),
}));

vi.mock("@/infrastructure/auth/PrismaLeadSessionService", () => ({
  PrismaLeadSessionService: vi.fn().mockImplementation(function PrismaLeadSessionService() {
    return { create: mockCreateSession, resolve: vi.fn() };
  }),
}));

const { POST } = await import("../../../app/api/leads/route");

const validPayload = {
  campaignId: "11111111-1111-1111-1111-111111111111",
  parentName: "Jane Doe",
  babyName: "Baby Doe",
  email: "jane@example.com",
};

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/leads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSession.mockResolvedValue({
      token: "session-token",
      expiresAt: new Date("2026-08-14T00:00:00.000Z"),
    });
  });

  it("registers a lead and returns 201 with only the public fields — never a Lead id", async () => {
    mockRepository.existsByEmail.mockResolvedValue(false);
    mockRepository.create.mockImplementation(async (lead: Lead) => lead);

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(Object.keys(body).sort()).toEqual(["remainingAttempts", "status"]);
    expect(body.remainingAttempts).toBe(5);
    expect(body.status).toBe("REGISTERED");
    expect(JSON.stringify(body)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
  });

  it("issues a session and sets it as an HttpOnly cookie", async () => {
    mockRepository.existsByEmail.mockResolvedValue(false);
    mockRepository.create.mockImplementation(async (lead: Lead) => lead);

    const response = await POST(postRequest(validPayload));

    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    const setCookieHeader = response.headers.get("set-cookie");
    expect(setCookieHeader).toContain("lead_session=session-token");
    expect(setCookieHeader).toMatch(/HttpOnly/i);
    expect(setCookieHeader).toMatch(/SameSite=Lax/i);
    expect(setCookieHeader).toMatch(/Path=\//i);
  });

  it("returns 409 when the email is already registered", async () => {
    mockRepository.existsByEmail.mockResolvedValue(true);

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("email_already_registered");
    expect(mockRepository.create).not.toHaveBeenCalled();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid payload without calling the repository", async () => {
    const response = await POST(postRequest({ ...validPayload, parentName: "" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
    expect(mockRepository.existsByEmail).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed email caught by the domain value object", async () => {
    mockRepository.existsByEmail.mockResolvedValue(false);

    const response = await POST(postRequest({ ...validPayload, email: "not-an-email" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
  });

  it("returns 500 and hides internal details on an unexpected error", async () => {
    mockRepository.existsByEmail.mockResolvedValue(false);
    mockRepository.create.mockRejectedValue(new Error("connection reset by peer"));

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("internal_error");
    expect(JSON.stringify(body)).not.toContain("connection reset by peer");
    expect(body.stack).toBeUndefined();
  });
});
