import "dotenv/config";
import { describe, expect, it } from "vitest";
import { SignedSessionTokenService } from "@/infrastructure/auth/SignedSessionTokenService";

describe("SignedSessionTokenService", () => {
  it("issues a token that verifies back to the same payload", async () => {
    const service = new SignedSessionTokenService();
    const issued = await service.issue({ adminId: "admin-1", email: "admin@example.com" });

    const verified = await service.verify(issued.token);

    expect(verified).toEqual({ adminId: "admin-1", email: "admin@example.com" });
  });

  it("gives a longer expiry when rememberMe is true", async () => {
    const service = new SignedSessionTokenService();
    const normal = await service.issue({ adminId: "admin-1", email: "admin@example.com" });
    const remembered = await service.issue(
      { adminId: "admin-1", email: "admin@example.com" },
      { rememberMe: true },
    );

    expect(remembered.expiresAt.getTime()).toBeGreaterThan(normal.expiresAt.getTime());
  });

  it("rejects a token with a tampered payload", async () => {
    const service = new SignedSessionTokenService();
    const issued = await service.issue({ adminId: "admin-1", email: "admin@example.com" });

    const [, signature] = issued.token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ adminId: "someone-else", email: "x", exp: Date.now() + 1000000 }),
    ).toString("base64url");
    const tampered = `${forgedBody}.${signature}`;

    await expect(service.verify(tampered)).resolves.toBeNull();
  });

  it("rejects a malformed token", async () => {
    const service = new SignedSessionTokenService();
    await expect(service.verify("not-a-real-token")).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const service = new SignedSessionTokenService();

    // Simulate an already-expired token by issuing then monkeypatching
    // Date.now forward past its expiry, rather than waiting in real time.
    const issued = await service.issue({ adminId: "admin-1", email: "admin@example.com" });
    const realNow = Date.now;
    Date.now = () => realNow() + 1000 * 60 * 60 * 24;

    try {
      await expect(service.verify(issued.token)).resolves.toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});
