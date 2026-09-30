import "dotenv/config";
import { describe, expect, it } from "vitest";
import { bannerUrl } from "@/infrastructure/email/emailChrome";
import { SongReadyEmailTemplate } from "@/infrastructure/email/SongReadyEmailTemplate";

const SHARE_TOKEN = "aabbccdd11223344";
const SHARE_URL = `https://miprimeracancion.bassa.com.ec/song/share/${SHARE_TOKEN}`;

/** The tracking URLs the buttons point at — what the parent clicks. */
const TRACKING = {
  whatsapp: `${SHARE_URL}/to/whatsapp?utm_source=whatsapp&utm_medium=social&utm_campaign=family_song`,
  facebook: `${SHARE_URL}/to/facebook?utm_source=facebook&utm_medium=social&utm_campaign=family_song`,
  x: `${SHARE_URL}/to/x?utm_source=x&utm_medium=social&utm_campaign=family_song`,
};

const SHARE_LINKS = { shareUrl: SHARE_URL, tracking: TRACKING };

/** A URL as it appears inside an HTML attribute, with `&` escaped. */
function inHtml(url: string): string {
  return url.replace(/&/g, "&amp;");
}

const SIGNED_AUDIO_URL =
  "https://acct.r2.cloudflarestorage.com/bucket/songs/x.mp3?X-Amz-Credential=AKIAKEYID%2F20260930&X-Amz-Signature=deadbeef";

const CONTENT = {
  parentName: "Jane Doe",
  babyName: "Baby Doe",
  audioUrl: SIGNED_AUDIO_URL,
  duration: 60,
  shareLinks: SHARE_LINKS,
};

describe("SongReadyEmailTemplate", () => {
  it("has a fixed, non-internal subject", () => {
    expect(SongReadyEmailTemplate.subject()).toBe("¡Tu canción personalizada ya está lista!");
  });

  it("renders a responsive HTML body with greeting, playback, download, support, and footer", () => {
    const html = SongReadyEmailTemplate.html({
      parentName: "Jane Doe",
      babyName: "Baby Doe",
      audioUrl: "https://cdn.example.com/song.mp3",
      duration: 125,
      shareLinks: SHARE_LINKS,
    });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Hola Jane Doe,");
    expect(html).toContain("Baby Doe");
    expect(html).toContain("Gracias");
    // Direct playback and download both point straight at the stored file —
    // never a link back into the application (see the Download section of
    // docs/Product/User_Flow.md).
    expect(html).toContain('href="https://cdn.example.com/song.mp3"');
    expect(html).toContain("Escuchar la canción");
    expect(html).toContain("download");
    expect(html).toContain("Descargar la canción");
    expect(html).toContain("mailto:");
    expect(html).toContain("2:05");
  });

  it("uses the approved campaign banner as its header, absolutely and with alt text", () => {
    const html = SongReadyEmailTemplate.html(CONTENT);

    expect(html).toContain(`src="${bannerUrl()}"`);
    expect(html).toMatch(/alt="[^"]+"/);
  });

  it("keeps the duration dynamic rather than printing a fixed value", () => {
    expect(SongReadyEmailTemplate.html({ ...CONTENT, duration: 60 })).toContain("Duración: 1:00");
    expect(SongReadyEmailTemplate.html({ ...CONTENT, duration: 95 })).toContain("Duración: 1:35");
    expect(SongReadyEmailTemplate.html({ ...CONTENT, duration: 7 })).toContain("Duración: 0:07");
  });

  describe("share section", () => {
    it("points every button at this application's tracking route, not at the platform", () => {
      // The parent clicks our URL; the platform URL is built at redirect
      // time (see `shareDestinations`). Nothing in the email addresses
      // wa.me, facebook.com or twitter.com any more.
      const html = SongReadyEmailTemplate.html(CONTENT);

      expect(html).toContain(inHtml(TRACKING.whatsapp));
      expect(html).toContain(inHtml(TRACKING.facebook));
      expect(html).toContain(inHtml(TRACKING.x));

      expect(html).not.toContain("wa.me");
      expect(html).not.toContain("facebook.com/sharer");
      expect(html).not.toContain("twitter.com/intent");
    });

    it("offers exactly WhatsApp, Facebook and X, and nothing else", () => {
      const html = SongReadyEmailTemplate.html(CONTENT);

      expect(html).toContain("Comparte este momento");
      expect(html).toContain(">WhatsApp<");
      expect(html).toContain(">Facebook<");
      expect(html).toContain(">X<");
    });

    it("has no LinkedIn anywhere, by explicit requirement", () => {
      expect(SongReadyEmailTemplate.html(CONTENT).toLowerCase()).not.toContain("linkedin");
    });

    it("shows the clean public URL as the copyable link, never the tracking URL", () => {
      // This is the one place the reader sees a URL as text. A tracking
      // URL here would be copied and pasted, and every recipient opening
      // it would record a share that never happened.
      const html = SongReadyEmailTemplate.html(CONTENT);

      expect(html).toContain("O copia este enlace:");
      expect(html).toContain(`>${SHARE_URL}<`);
      expect(html).not.toContain(`>${inHtml(TRACKING.whatsapp)}<`);
    });

    it("never puts the tracking URL where a recipient would receive it", () => {
      const html = SongReadyEmailTemplate.html(CONTENT);

      // `/to/<platform>` may appear only inside an href, never as text.
      const asText = html.replace(/href="[^"]*"/g, "");
      expect(asText).not.toContain("/to/whatsapp");
      expect(asText).not.toContain("/to/facebook");
      expect(asText).not.toContain("/to/x");
    });

    it("never shares the signed audio URL, which carries a credential and expires", () => {
      const html = SongReadyEmailTemplate.html(CONTENT);
      const shareHrefs = [...html.matchAll(/href="([^"]*\/to\/[^"]*)"/g)].map((m) => m[1]);

      expect(shareHrefs).toHaveLength(3);
      for (const href of shareHrefs) {
        expect(href).not.toContain("X-Amz-Credential");
        expect(href).not.toContain("r2.cloudflarestorage.com");
      }
    });

    it("never puts the resume link or any session token in a share button", () => {
      const html = SongReadyEmailTemplate.html(CONTENT);

      expect(html).not.toContain("/resume/");
      expect(html).not.toContain("resumeToken");
    });

    it("omits the whole share section when the song has no public page", () => {
      const html = SongReadyEmailTemplate.html({ ...CONTENT, shareLinks: null });

      expect(html).not.toContain("Comparte este momento");
      expect(html).not.toContain("/to/whatsapp");
      expect(html).not.toContain("O copia este enlace:");
      // The rest of the email is unaffected.
      expect(html).toContain("Escuchar la canción");
      expect(html).toContain("Descargar la canción");
    });

    it("contains no JavaScript", () => {
      const html = SongReadyEmailTemplate.html(CONTENT);

      expect(html).not.toContain("<script");
      expect(html).not.toContain("onclick");
      expect(html).not.toContain("navigator.clipboard");
      expect(html).not.toContain("javascript:");
    });
  });

  it("keeps playback and download pointing at the signed audio URL", () => {
    const html = SongReadyEmailTemplate.html(CONTENT);

    expect(html).toContain("Escuchar la canción");
    expect(html).toContain("Descargar la canción");
    expect(html).toContain(" download");
    // Exactly the two buttons, and nowhere else.
    expect(html.split(SIGNED_AUDIO_URL.replace(/&/g, "&amp;")).length - 1).toBe(2);
  });

  it("escapes the parent's and baby's names rather than interpolating them raw", () => {
    const html = SongReadyEmailTemplate.html({
      ...CONTENT,
      parentName: "Ana & Luis",
      babyName: "<b>Lía</b>",
    });

    expect(html).toContain("Hola Ana &amp; Luis,");
    expect(html).not.toContain("<b>Lía</b>");
  });

  it("omits the duration line when duration is not available", () => {
    const html = SongReadyEmailTemplate.html({
      parentName: "Jane Doe",
      babyName: "Baby Doe",
      audioUrl: "https://cdn.example.com/song.mp3",
      duration: null,
      shareLinks: SHARE_LINKS,
    });

    expect(html).not.toContain("Duración:");
  });
});
