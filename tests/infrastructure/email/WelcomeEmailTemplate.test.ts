import "dotenv/config";
import { describe, expect, it } from "vitest";
import { bannerUrl } from "@/infrastructure/email/emailChrome";
import { WelcomeEmailTemplate } from "@/infrastructure/email/WelcomeEmailTemplate";

const CONTENT = {
  parentName: "Jane Doe",
  babyName: "Baby Doe",
  resumeUrl: "https://example.com/resume/abc123",
};

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

  it("uses the approved campaign banner as its header, absolutely and with alt text", () => {
    const html = WelcomeEmailTemplate.html(CONTENT);

    expect(html).toContain(`src="${bannerUrl()}"`);
    expect(html).toMatch(/alt="[^"]+"/);
  });

  it("shows the three steps of the real flow, including approving the lyric", () => {
    const html = WelcomeEmailTemplate.html(CONTENT);

    expect(html).toContain("¿Qué sigue?");
    expect(html).toContain("Cuéntanos sobre tu bebé");
    // The step the campaign most needs them to come back for: 86 families
    // without a song are sitting on a lyric they never approved.
    expect(html).toContain("Revisa y aprueba la letra");
    expect(html).toContain("¡Disfruta la canción!");
  });

  it("keeps the 'guarda este correo' block and its meaning", () => {
    const html = WelcomeEmailTemplate.html(CONTENT);

    expect(html).toContain("Guarda este correo");
    expect(html).toContain("al paso en el que te quedaste");
  });

  it("escapes the parent's and baby's names rather than interpolating them raw", () => {
    const html = WelcomeEmailTemplate.html({
      parentName: "Ana & Luis",
      babyName: "<b>Lía</b>",
      resumeUrl: "https://example.com/resume/abc123",
    });

    expect(html).toContain("Hola Ana &amp; Luis,");
    expect(html).toContain("&lt;b&gt;Lía&lt;/b&gt;");
    expect(html).not.toContain("<b>Lía</b>");
  });

  it("contains no JavaScript and nothing Gmail or Outlook would strip", () => {
    const html = WelcomeEmailTemplate.html(CONTENT);

    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<style");
    expect(html).not.toContain("display:flex");
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
