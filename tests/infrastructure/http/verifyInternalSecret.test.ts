import "dotenv/config";
import { describe, expect, it } from "vitest";
import { appConfig } from "@/config/app";
import { verifyInternalSecret } from "@/infrastructure/http/verifyInternalSecret";

function requestWithAuth(header?: string): Request {
  return new Request("http://localhost/api/internal/health", {
    headers: header ? { authorization: header } : {},
  });
}

describe("verifyInternalSecret", () => {
  it("returns true for the correct bearer token", () => {
    expect(verifyInternalSecret(requestWithAuth(`Bearer ${appConfig.internal.cronSecret}`))).toBe(
      true,
    );
  });

  it("returns false with no Authorization header", () => {
    expect(verifyInternalSecret(requestWithAuth())).toBe(false);
  });

  it("returns false for a non-Bearer scheme", () => {
    expect(verifyInternalSecret(requestWithAuth(`Basic ${appConfig.internal.cronSecret}`))).toBe(
      false,
    );
  });

  it("returns false for a wrong token of the same length", () => {
    const wrong = "x".repeat(appConfig.internal.cronSecret.length);
    expect(verifyInternalSecret(requestWithAuth(`Bearer ${wrong}`))).toBe(false);
  });

  it("returns false for a token of a different length", () => {
    expect(verifyInternalSecret(requestWithAuth("Bearer short"))).toBe(false);
  });

  it("returns false for an empty bearer token", () => {
    expect(verifyInternalSecret(requestWithAuth("Bearer "))).toBe(false);
  });
});
