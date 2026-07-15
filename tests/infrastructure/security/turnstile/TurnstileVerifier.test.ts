import { describe, expect, it, vi } from "vitest";
import type { TurnstileClient } from "@/infrastructure/security/turnstile/TurnstileClient";
import { TurnstileVerifier } from "@/infrastructure/security/turnstile/TurnstileVerifier";

function fakeClient(siteverify: TurnstileClient["siteverify"]): TurnstileClient {
  return { siteverify } as unknown as TurnstileClient;
}

describe("TurnstileVerifier", () => {
  it("succeeds for a valid token", async () => {
    const client = fakeClient(vi.fn().mockResolvedValue({ success: true }));
    const verifier = new TurnstileVerifier(client);

    const result = await verifier.verify("valid-token", "203.0.113.4");

    expect(result).toEqual({ success: true, errorCodes: [] });
    expect(client.siteverify).toHaveBeenCalledWith("valid-token", "203.0.113.4");
  });

  it("fails for an invalid token", async () => {
    const client = fakeClient(
      vi.fn().mockResolvedValue({ success: false, "error-codes": ["invalid-input-response"] }),
    );
    const verifier = new TurnstileVerifier(client);

    const result = await verifier.verify("invalid-token");

    expect(result.success).toBe(false);
    expect(result.errorCodes).toEqual(["invalid-input-response"]);
    expect(verifier.isExpiredOrAlreadyUsed(result)).toBe(false);
  });

  it("identifies an expired or already-redeemed token", async () => {
    const client = fakeClient(
      vi.fn().mockResolvedValue({ success: false, "error-codes": ["timeout-or-duplicate"] }),
    );
    const verifier = new TurnstileVerifier(client);

    const result = await verifier.verify("expired-token");

    expect(result.success).toBe(false);
    expect(verifier.isExpiredOrAlreadyUsed(result)).toBe(true);
  });

  it("rejects a missing token without calling the client", async () => {
    const client = fakeClient(vi.fn());
    const verifier = new TurnstileVerifier(client);

    const result = await verifier.verify(undefined);

    expect(result).toEqual({ success: false, errorCodes: ["missing-input-response"] });
    expect(client.siteverify).not.toHaveBeenCalled();
  });

  it("rejects a blank token without calling the client", async () => {
    const client = fakeClient(vi.fn());
    const verifier = new TurnstileVerifier(client);

    const result = await verifier.verify("   ");

    expect(result.success).toBe(false);
    expect(client.siteverify).not.toHaveBeenCalled();
  });
});
