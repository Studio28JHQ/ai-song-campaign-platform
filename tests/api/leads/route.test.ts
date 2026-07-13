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

vi.mock("@/infrastructure/persistence/prisma/lead/PrismaLeadRepository", () => ({
  PrismaLeadRepository: vi.fn().mockImplementation(function PrismaLeadRepository() {
    return mockRepository;
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
  });

  it("registers a lead and returns 201 with only the public fields", async () => {
    mockRepository.existsByEmail.mockResolvedValue(false);
    mockRepository.create.mockImplementation(async (lead: Lead) => lead);

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(Object.keys(body).sort()).toEqual(["leadId", "remainingAttempts", "status"]);
    expect(body.remainingAttempts).toBe(5);
    expect(body.status).toBe("REGISTERED");
    expect(typeof body.leadId).toBe("string");
  });

  it("returns 409 when the email is already registered", async () => {
    mockRepository.existsByEmail.mockResolvedValue(true);

    const response = await POST(postRequest(validPayload));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("email_already_registered");
    expect(mockRepository.create).not.toHaveBeenCalled();
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
