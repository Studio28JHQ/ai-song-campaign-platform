import "dotenv/config";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockVerify = vi.fn();

vi.mock("@/infrastructure/auth/SignedSessionTokenService", () => ({
  SignedSessionTokenService: vi.fn().mockImplementation(function SignedSessionTokenService() {
    return { verify: mockVerify, issue: vi.fn() };
  }),
}));

const { middleware } = await import("../middleware");

function requestFor(path: string, cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = `admin_session=${cookie}`;
  return new NextRequest(new Request(`http://localhost${path}`, { headers }));
}

describe("admin middleware", () => {
  it("redirects an unauthenticated page request to /admin/login", async () => {
    mockVerify.mockResolvedValue(null);

    const response = await middleware(requestFor("/admin/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/admin/login");
  });

  it("returns 401 JSON for an unauthenticated API request", async () => {
    mockVerify.mockResolvedValue(null);

    const response = await middleware(requestFor("/api/admin/dashboard"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("unauthorized");
  });

  it("passes an authenticated page request through", async () => {
    mockVerify.mockResolvedValue({ adminId: "admin-1", email: "admin@example.com" });

    const response = await middleware(requestFor("/admin/dashboard", "valid-token"));

    // next() responses carry no location/redirect status.
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("passes an authenticated API request through", async () => {
    mockVerify.mockResolvedValue({ adminId: "admin-1", email: "admin@example.com" });

    const response = await middleware(requestFor("/api/admin/dashboard", "valid-token"));
    expect(response.status).toBe(200);
  });

  it("never gates /admin/login, even without a session", async () => {
    mockVerify.mockResolvedValue(null);

    const response = await middleware(requestFor("/admin/login"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("never gates /api/admin/login or /api/admin/logout", async () => {
    mockVerify.mockResolvedValue(null);

    const loginResponse = await middleware(requestFor("/api/admin/login"));
    const logoutResponse = await middleware(requestFor("/api/admin/logout"));

    expect(loginResponse.status).toBe(200);
    expect(logoutResponse.status).toBe(200);
  });

  it("redirects when a session cookie is present but invalid/expired", async () => {
    mockVerify.mockResolvedValue(null);

    const response = await middleware(requestFor("/admin/dashboard", "tampered-or-expired"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/admin/login");
  });
});
