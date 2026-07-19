import "dotenv/config";
import { describe, expect, it } from "vitest";
import { WelcomeEmailTemplate } from "@/infrastructure/email/WelcomeEmailTemplate";

describe("WelcomeEmailTemplate", () => {
  it("has a fixed, non-internal subject", () => {
    expect(WelcomeEmailTemplate.subject()).not.toContain("undefined");
    expect(WelcomeEmailTemplate.subject().length).toBeGreaterThan(0);
  });

  it("renders a responsive HTML body with greeting, baby's name, and the resume link", () => {
    const html = WelcomeEmailTemplate.html({
      parentName: "Jane Doe",
      babyName: "Baby Doe",
      resumeUrl: "https://example.com/resume/abc123",
    });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Hola Jane Doe,");
    expect(html).toContain("Baby Doe");
    expect(html).toContain('href="https://example.com/resume/abc123"');
    expect(html).toContain("mailto:");
    // The resume button reflects what the page actually does — checking
    // progress, not "continuing" a song that's already in production.
    expect(html).toContain("Ver el progreso de mi canción");
  });

  it("never embeds anything other than the resume URL, parent name, and baby name", () => {
    const html = WelcomeEmailTemplate.html({
      parentName: "Jane Doe",
      babyName: "Baby Doe",
      resumeUrl: "https://example.com/resume/abc123",
    });

    // No leaked identifiers beyond what was explicitly passed in.
    expect(html).not.toContain("leadId");
    expect(html).not.toContain("@example.com\n"); // no raw parent email echoed
  });
});
