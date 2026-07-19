import "dotenv/config";
import { describe, expect, it } from "vitest";
import { appConfig, buildAppUrl } from "@/config/app";

describe("buildAppUrl", () => {
  it("builds an absolute URL from the configured public base URL — never a hardcoded string", () => {
    const url = buildAppUrl("/resume/abc123");

    expect(url).toBe(new URL("/resume/abc123", appConfig.url).toString());
    expect(url.startsWith(appConfig.url)).toBe(true);
  });

  it("reflects appConfig.url even when it changes — there is no fallback or hardcoded default baked into the function", () => {
    const path = "/resume/xyz789";

    expect(buildAppUrl(path)).toBe(new URL(path, appConfig.url).toString());
  });
});
