import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessRuleError } from "@/shared/errors";

const mockFindByEmail = vi.fn();
const mockUpdate = vi.fn();
const mockAuditCreate = vi.fn();
const mockVerifyPassword = vi.fn();
const mockIssueToken = vi.fn();

vi.mock("@/infrastructure/persistence/prisma/admin/PrismaAdminUserRepository", () => ({
  PrismaAdminUserRepository: vi.fn().mockImplementation(function PrismaAdminUserRepository() {
    return { findByEmail: mockFindByEmail, update: mockUpdate };
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository", () => ({
  PrismaAuditLogRepository: vi.fn().mockImplementation(function PrismaAuditLogRepository() {
    return { create: mockAuditCreate, findByEntity: vi.fn() };
  }),
}));

vi.mock("@/infrastructure/auth/ScryptPasswordHasher", () => ({
  ScryptPasswordHasher: vi.fn().mockImplementation(function ScryptPasswordHasher() {
    return { hash: vi.fn(), verify: mockVerifyPassword };
  }),
}));

vi.mock("@/infrastructure/auth/SignedSessionTokenService", () => ({
  SignedSessionTokenService: vi.fn().mockImplementation(function SignedSessionTokenService() {
    return { issue: mockIssueToken, verify: vi.fn() };
  }),
}));

// RC-2 — Production Hardening. These tests exercise login business logic,
// not rate limiting itself (see dedicated tests below) — mocked here so
// no real DB call happens and every attempt is allowed by default.
const mockCountRecentEvents = vi.fn().mockResolvedValue(0);
const mockRecordEvent = vi.fn().mockResolvedValue(undefined);

vi.mock("@/infrastructure/persistence/prisma/security/PrismaRateLimitRepository", () => ({
  PrismaRateLimitRepository: vi.fn().mockImplementation(function PrismaRateLimitRepository() {
    return { countRecentEvents: mockCountRecentEvents, recordEvent: mockRecordEvent };
  }),
}));

const { POST } = await import("../../../app/api/admin/login/route");

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fakeAdmin(overrides: Record<string, unknown> = {}) {
  return {
    id: "admin-1",
    email: "admin@example.com",
    passwordHash: "stored-hash",
    name: "Jane Admin",
    role: "admin",
    active: true,
    lastLogin: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    assertCanAuthenticate: vi.fn(),
    recordLogin: vi.fn(),
    toSnapshot: () => ({
      id: "admin-1",
      email: "admin@example.com",
      name: "Jane Admin",
      role: "admin",
      active: true,
      lastLogin: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    ...overrides,
  };
}

describe("POST /api/admin/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockImplementation(async (admin) => admin);
    mockIssueToken.mockResolvedValue({ token: "signed-token", expiresAt: new Date() });
    mockCountRecentEvents.mockResolvedValue(0);
  });

  it("returns 200 and sets an HTTP-only session cookie on success", async () => {
    mockFindByEmail.mockResolvedValue(fakeAdmin());
    mockVerifyPassword.mockResolvedValue(true);

    const response = await POST(postRequest({ email: "admin@example.com", password: "correct" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.admin.email).toBe("admin@example.com");
    expect(body).not.toHaveProperty("token");
    expect(JSON.stringify(body)).not.toContain("stored-hash");

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("admin_session=signed-token");
    expect(setCookie).toContain("HttpOnly");
  });

  it("returns 401 for an unknown email, without leaking which field was wrong", async () => {
    mockFindByEmail.mockResolvedValue(null);

    const response = await POST(postRequest({ email: "missing@example.com", password: "x" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("invalid_credentials");
    expect(body.message).toBe("Invalid email or password.");
  });

  it("returns 401 for a wrong password", async () => {
    mockFindByEmail.mockResolvedValue(fakeAdmin());
    mockVerifyPassword.mockResolvedValue(false);

    const response = await POST(postRequest({ email: "admin@example.com", password: "wrong" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("invalid_credentials");
  });

  it("returns 403 for an inactive account", async () => {
    mockFindByEmail.mockResolvedValue(
      fakeAdmin({
        assertCanAuthenticate: vi.fn(() => {
          throw new BusinessRuleError("This admin account is inactive.", {
            code: "admin.account_inactive",
          });
        }),
      }),
    );
    mockVerifyPassword.mockResolvedValue(true);

    const response = await POST(postRequest({ email: "admin@example.com", password: "correct" }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("account_inactive");
  });

  it("returns 400 for a malformed payload", async () => {
    const response = await POST(postRequest({ email: "admin@example.com" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
    expect(mockFindByEmail).not.toHaveBeenCalled();
  });

  describe("RC-2 — Production Hardening: rate limiting and security-event recording", () => {
    it("returns 429 and records a security event when the per-IP login attempt limit is exceeded", async () => {
      mockCountRecentEvents.mockResolvedValue(999);

      const response = await POST(postRequest({ email: "admin@example.com", password: "x" }));
      const body = await response.json();

      expect(response.status).toBe(429);
      expect(body.error).toBe("too_many_requests");
      expect(mockFindByEmail).not.toHaveBeenCalled();
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
      const recorded = mockAuditCreate.mock.calls[0][0];
      expect(recorded.action).toBe("rate_limit_exceeded");
      expect(recorded.adminId).toBeNull();
    });

    it("allows the attempt through and records a request when under the limit", async () => {
      mockFindByEmail.mockResolvedValue(fakeAdmin());
      mockVerifyPassword.mockResolvedValue(true);

      const response = await POST(postRequest({ email: "admin@example.com", password: "correct" }));

      expect(response.status).toBe(200);
      expect(mockRecordEvent).toHaveBeenCalledTimes(1);
    });

    it("records a security event (and AuditLog entry) for an unknown email, without leaking which field was wrong", async () => {
      mockFindByEmail.mockResolvedValue(null);

      const response = await POST(postRequest({ email: "missing@example.com", password: "x" }));
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("invalid_credentials");
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
      const recorded = mockAuditCreate.mock.calls[0][0];
      expect(recorded.action).toBe("invalid_login_credentials");
      expect(recorded.adminId).toBeNull();
      expect(recorded.entity).toBe("AdminUser");
    });

    it("records a security event for a wrong password", async () => {
      mockFindByEmail.mockResolvedValue(fakeAdmin());
      mockVerifyPassword.mockResolvedValue(false);

      await POST(postRequest({ email: "admin@example.com", password: "wrong" }));

      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
      expect(mockAuditCreate.mock.calls[0][0].action).toBe("invalid_login_credentials");
    });

    it("does not record a security event for an inactive account (a known state, not suspicious behavior)", async () => {
      mockFindByEmail.mockResolvedValue(
        fakeAdmin({
          assertCanAuthenticate: vi.fn(() => {
            throw new BusinessRuleError("This admin account is inactive.", {
              code: "admin.account_inactive",
            });
          }),
        }),
      );
      mockVerifyPassword.mockResolvedValue(true);

      await POST(postRequest({ email: "admin@example.com", password: "correct" }));

      expect(mockAuditCreate).not.toHaveBeenCalled();
    });
  });
});
