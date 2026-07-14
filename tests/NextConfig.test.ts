import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("next.config.ts security headers", () => {
  it("applies the expected security headers to every route", async () => {
    const headerGroups = await nextConfig.headers!();

    expect(headerGroups).toHaveLength(1);
    const { source, headers } = headerGroups[0];
    expect(source).toBe("/:path*");

    const byKey = Object.fromEntries(headers.map((h) => [h.key, h.value]));
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["Permissions-Policy"]).toBeDefined();
    expect(byKey["Strict-Transport-Security"]).toContain("max-age=");
  });
});
