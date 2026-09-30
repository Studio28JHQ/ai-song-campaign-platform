import "dotenv/config";
import { describe, expect, it } from "vitest";
import { appConfig } from "@/config/app";
import {
  bannerUrl,
  escapeHtml,
  renderButton,
  renderDocument,
} from "@/infrastructure/email/emailChrome";

/**
 * The shared email chrome. These tests hold the two things that are easy
 * to break silently in a string of HTML nobody renders in CI: that
 * dynamic values are escaped before they reach the markup, and that the
 * banner is an absolute URL — a mail client has no origin to resolve a
 * relative path against, so `/campaign/...` would simply not load.
 */
describe("escapeHtml", () => {
  it.each([
    ["Ana & Luis", "Ana &amp; Luis"],
    ["<script>", "&lt;script&gt;"],
    ['a"b', "a&quot;b"],
    ["O'Brien", "O&#39;Brien"],
  ])("escapes %s", (input, expected) => {
    expect(escapeHtml(input)).toBe(expected);
  });

  it("leaves ordinary Spanish text, accents and emoji untouched", () => {
    expect(escapeHtml("Lía Camille 🎵")).toBe("Lía Camille 🎵");
  });
});

describe("bannerUrl", () => {
  it("is absolute, https, and points at the approved campaign banner", () => {
    const url = bannerUrl();

    expect(url).toMatch(/^https?:\/\//);
    expect(url.endsWith("/campaign/banners/banner-campaign.jpg")).toBe(true);
    // Built from the app's single configured base URL, never hardcoded.
    expect(url.startsWith(new URL(appConfig.url).origin)).toBe(true);
  });
});

describe("renderButton", () => {
  it("escapes the href and adds `download` only when asked", () => {
    const plain = renderButton({
      href: "https://e.test/a?x=1&y=2",
      label: "Ir",
      variant: "primary",
    });
    expect(plain).toContain("https://e.test/a?x=1&amp;y=2");
    expect(plain).not.toContain(" download");

    const file = renderButton({
      href: "https://e.test/s.mp3",
      label: "Bajar",
      variant: "secondary",
      download: true,
    });
    expect(file).toContain(" download");
  });

  it("renders as a table with an inline-styled anchor, not a CSS-class button", () => {
    const html = renderButton({ href: "https://e.test", label: "Ir", variant: "primary" });

    expect(html).toContain("<table");
    expect(html).toContain("<a href=");
    expect(html).toContain("style=");
    expect(html).not.toContain("class=");
  });
});

describe("renderDocument", () => {
  const doc = renderDocument({
    title: "Asunto",
    preheader: "Vista previa",
    contentHtml: "<p>cuerpo</p>",
    campaignName: "Mi primera canción",
  });

  it("emits a complete document with charset, viewport and the banner", () => {
    expect(doc).toContain("<!doctype html>");
    expect(doc).toContain('<meta charset="utf-8" />');
    expect(doc).toContain("width=device-width");
    expect(doc).toContain(`src="${bannerUrl()}"`);
  });

  it("gives the banner a descriptive alt and blocks it out, as email images must be", () => {
    expect(doc).toMatch(/alt="Mi primera canción[^"]+"/);
    expect(doc).toContain("display:block");
  });

  it("uses no mechanism email clients strip or refuse", () => {
    // Gmail drops <style>; Outlook renders through Word and has no
    // flex/grid; scripts are stripped everywhere and are a red flag.
    expect(doc).not.toContain("<style");
    expect(doc).not.toContain("<script");
    expect(doc).not.toContain("display:flex");
    expect(doc).not.toContain("display:grid");
    expect(doc).not.toContain("<svg");
    expect(doc).not.toContain("@media");
    expect(doc).not.toContain("class=");
  });

  it("is a fluid 600px card, so it fits a phone without horizontal scroll", () => {
    expect(doc).toContain("max-width:600px");
    expect(doc).toContain("width:100%");
  });

  it("carries a preheader for the inbox list, hidden from the body", () => {
    expect(doc).toContain("Vista previa");
    expect(doc).toContain("display:none");
  });
});
