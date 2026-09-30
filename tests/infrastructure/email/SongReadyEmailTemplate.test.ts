import "dotenv/config";
import { describe, expect, it } from "vitest";
import { appConfig } from "@/config/app";
import { bannerUrl } from "@/infrastructure/email/emailChrome";
import { SongReadyEmailTemplate } from "@/infrastructure/email/SongReadyEmailTemplate";

const SHARE_URL = "https://miprimeracancion.bassa.com.ec/song/share/aabbccdd11223344";

/** Mirrors the template's own X wording, so the encoding assertions test the real string. */
function shareMessageFor(babyName: string): string {
  return `🎵 Escucha la canción personalizada que creamos para ${babyName} en ${appConfig.campaign.name} ❤️`;
}

/** The emoji-free wording WhatsApp and Facebook receive. */
function plainShareMessageFor(babyName: string): string {
  return `¡Escucha la canción personalizada que creamos para ${babyName} en ${appConfig.campaign.name}!`;
}

/** The three share hrefs, with HTML entities decoded back into the real URL. */
function shareHrefs(html: string): Record<"whatsapp" | "facebook" | "x", URL> {
  const found = [
    ...html.matchAll(/href="(https:\/\/(?:wa\.me|www\.facebook\.com|twitter\.com)[^"]*)"/g),
  ].map((match) => new URL(match[1].replace(/&amp;/g, "&")));

  return {
    whatsapp: found.find((url) => url.host === "wa.me") as URL,
    facebook: found.find((url) => url.host === "www.facebook.com") as URL,
    x: found.find((url) => url.host === "twitter.com") as URL,
  };
}

const SIGNED_AUDIO_URL =
  "https://acct.r2.cloudflarestorage.com/bucket/songs/x.mp3?X-Amz-Credential=AKIAKEYID%2F20260930&X-Amz-Signature=deadbeef";

const CONTENT = {
  parentName: "Jane Doe",
  babyName: "Baby Doe",
  audioUrl: SIGNED_AUDIO_URL,
  duration: 60,
  shareUrl: SHARE_URL,
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
      shareUrl: SHARE_URL,
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
    it("offers WhatsApp, Facebook and X, and nothing else", () => {
      const html = SongReadyEmailTemplate.html(CONTENT);

      expect(html).toContain("Comparte este momento");
      expect(html).toContain("https://wa.me/?text=");
      expect(html).toContain("https://www.facebook.com/sharer/sharer.php?u=");
      expect(html).toContain("https://twitter.com/intent/tweet?");
    });

    it("puts the share URL in all three buttons and nowhere unsafe", () => {
      const html = SongReadyEmailTemplate.html(CONTENT);
      const encoded = encodeURIComponent(SHARE_URL);

      // WhatsApp carries it inside the message text; the other two as a
      // dedicated url parameter.
      expect(html.split(encoded).length - 1).toBeGreaterThanOrEqual(3);
      // And it is offered as copyable text as well.
      expect(html).toContain(SHARE_URL);
    });

    it("has no LinkedIn anywhere, by explicit requirement", () => {
      const html = SongReadyEmailTemplate.html(CONTENT).toLowerCase();

      expect(html).not.toContain("linkedin");
    });

    it("never shares the signed audio URL, which carries a credential and expires", () => {
      // `audioUrl` is an R2 presigned link: its query string embeds
      // `X-Amz-Credential` (the bucket's access key id) and it dies after
      // 7 days. Posting that to Facebook or X would publish both problems.
      const html = SongReadyEmailTemplate.html(CONTENT);

      const shareHrefs = [
        ...html.matchAll(/href="(https:\/\/(?:wa\.me|www\.facebook\.com|twitter\.com)[^"]*)"/g),
      ].map((match) => match[1]);

      expect(shareHrefs).toHaveLength(3);
      for (const href of shareHrefs) {
        expect(href).not.toContain("X-Amz-Credential");
        expect(href).not.toContain("AKIAKEYID");
        expect(href).not.toContain("r2.cloudflarestorage.com");
      }
    });

    it("shares THIS song's public page, never the campaign landing page", () => {
      // Social Sharing: the previous version shared `/`, which meant a
      // recipient could not hear the song the post was about. Every
      // button now carries the song's own share URL.
      const html = SongReadyEmailTemplate.html(CONTENT);
      const encoded = encodeURIComponent(SHARE_URL);

      expect(html).toContain(`sharer.php?u=${encoded}`);
      expect(html).toContain(`&amp;url=${encoded}`);
      expect(html).toContain(
        encodeURIComponent(`${plainShareMessageFor("Baby Doe")} ${SHARE_URL}`),
      );

      // And the bare origin is never what gets shared.
      const bareOrigin = encodeURIComponent(new URL("/", appConfig.url).toString());
      expect(html).not.toContain(`sharer.php?u=${bareOrigin}`);
    });

    it("omits the whole share section when the song has no public page", () => {
      // A song that completed before the token column existed and was
      // never backfilled. Better to drop the section than to point it
      // somewhere that is not this song.
      const html = SongReadyEmailTemplate.html({ ...CONTENT, shareUrl: null });

      expect(html).not.toContain("Comparte este momento");
      expect(html).not.toContain("wa.me");
      expect(html).not.toContain("facebook.com");
      expect(html).not.toContain("twitter.com");
      // The rest of the email is unaffected.
      expect(html).toContain("Escuchar la canción");
      expect(html).toContain("Descargar la canción");
    });

    it("never puts the resume link or any session token in a share button", () => {
      const html = SongReadyEmailTemplate.html(CONTENT);

      expect(html).not.toContain("/resume/");
      expect(html).not.toContain("resumeToken");
    });

    describe("WhatsApp", () => {
      it("carries this song's URL and the expected text", () => {
        const { whatsapp } = shareHrefs(
          SongReadyEmailTemplate.html({ ...CONTENT, babyName: "Diana" }),
        );
        const text = whatsapp.searchParams.get("text") as string;

        expect(text).toContain(SHARE_URL);
        expect(text).toContain("Escucha la canción personalizada que creamos para Diana");
        expect(text).toContain(appConfig.campaign.name);
      });

      it("carries no emoji, which is what arrived as a replacement character", () => {
        const { whatsapp } = shareHrefs(SongReadyEmailTemplate.html(CONTENT));
        const text = whatsapp.searchParams.get("text") as string;

        // The two the real share showed as U+FFFD.
        expect(text).not.toContain("🎵");
        expect(text).not.toContain("❤️");
        // And no astral-plane character at all, which is the class of
        // thing that broke while accented Latin text came through fine.
        expect([...text].every((character) => character.codePointAt(0)! <= 0xffff)).toBe(true);
      });

      it("never contains the replacement character itself", () => {
        const { whatsapp } = shareHrefs(SongReadyEmailTemplate.html(CONTENT));

        expect(whatsapp.href).not.toContain("\uFFFD");
        expect(whatsapp.searchParams.get("text")).not.toContain("\uFFFD");
      });

      it("keeps accented Spanish, which was never the problem", () => {
        const { whatsapp } = shareHrefs(SongReadyEmailTemplate.html(CONTENT));

        expect(whatsapp.searchParams.get("text")).toContain("canción");
      });

      it("emits a correctly percent-encoded, pure-ASCII href", () => {
        const html = SongReadyEmailTemplate.html({ ...CONTENT, babyName: "Ana & Lía" });
        const raw = /href="(https:\/\/wa\.me[^"]*)"/.exec(html)?.[1] as string;

        // A URL is ASCII by construction once encoded; anything else
        // means a raw character leaked into the query string.
        expect([...raw].some((character) => character.charCodeAt(0) > 127)).toBe(false);
        // And it decodes back to exactly what was intended.
        expect(new URL(raw.replace(/&amp;/g, "&")).searchParams.get("text")).toContain("Ana & Lía");
      });
    });

    describe("Facebook", () => {
      it("carries this song's URL in `u` and the text in `quote`", () => {
        const { facebook } = shareHrefs(
          SongReadyEmailTemplate.html({ ...CONTENT, babyName: "Diana" }),
        );

        expect(facebook.pathname).toBe("/sharer/sharer.php");
        expect(facebook.searchParams.get("u")).toBe(SHARE_URL);
        expect(facebook.searchParams.get("quote")).toBe(plainShareMessageFor("Diana"));
      });

      it("does not depend on the page's Open Graph tags to supply the text", () => {
        // `u` alone is what produced a correct link with no sentence of
        // ours: Facebook built the post from the page's OG tags.
        const { facebook } = shareHrefs(SongReadyEmailTemplate.html(CONTENT));

        expect(facebook.searchParams.has("quote")).toBe(true);
        expect((facebook.searchParams.get("quote") as string).length).toBeGreaterThan(0);
      });

      it("never falls back to the campaign landing page", () => {
        const { facebook } = shareHrefs(SongReadyEmailTemplate.html(CONTENT));
        const shared = facebook.searchParams.get("u") as string;

        expect(shared).toBe(SHARE_URL);
        expect(shared).not.toBe(new URL("/", appConfig.url).toString());
        expect(shared).toContain("/song/share/");
      });

      it("does not repeat the URL inside the quoted text", () => {
        const { facebook } = shareHrefs(SongReadyEmailTemplate.html(CONTENT));

        expect(facebook.searchParams.get("quote")).not.toContain(SHARE_URL);
        expect(facebook.searchParams.get("quote")).not.toContain("http");
      });

      it("percent-encodes both parameters", () => {
        const html = SongReadyEmailTemplate.html({ ...CONTENT, babyName: "Ana & Lía" });
        const raw = /href="(https:\/\/www\.facebook\.com[^"]*)"/.exec(html)?.[1] as string;

        expect(raw).toContain(encodeURIComponent(SHARE_URL));
        expect(raw).toContain(encodeURIComponent(plainShareMessageFor("Ana & Lía")));
        // The `&` joining the two parameters is escaped for the HTML
        // attribute; the ampersand inside the name is not a separator.
        expect(raw).toContain("&amp;quote=");
      });
    });

    describe("X — unchanged", () => {
      it("still sends the emoji message in `text` and the song URL in `url`", () => {
        const { x } = shareHrefs(SongReadyEmailTemplate.html({ ...CONTENT, babyName: "Diana" }));

        expect(x.pathname).toBe("/intent/tweet");
        expect(x.searchParams.get("text")).toBe(shareMessageFor("Diana"));
        expect(x.searchParams.get("url")).toBe(SHARE_URL);
      });

      it("keeps the emoji a real share confirmed working there", () => {
        const { x } = shareHrefs(SongReadyEmailTemplate.html(CONTENT));

        expect(x.searchParams.get("text")).toContain("🎵");
        expect(x.searchParams.get("text")).toContain("❤️");
      });

      it("gains no new parameters", () => {
        const { x } = shareHrefs(SongReadyEmailTemplate.html(CONTENT));

        expect([...x.searchParams.keys()].sort()).toEqual(["text", "url"]);
      });
    });

    it("percent-encodes the share text, including the baby's name and emoji", () => {
      const html = SongReadyEmailTemplate.html({ ...CONTENT, babyName: "Lía & Ana" });

      // Encoded for the query string...
      expect(html).toContain(encodeURIComponent("Lía & Ana"));
      // ...and the resulting `&` separators escaped for the HTML attribute.
      expect(html).toContain("&amp;url=");
      expect(html).not.toMatch(/href="[^"]*text=[^"]*\sLía & Ana/);
    });

    it("replaces 'copy link' with a selectable link, since email cannot run a clipboard", () => {
      const html = SongReadyEmailTemplate.html(CONTENT);

      expect(html).toContain("O copia este enlace:");
      expect(html).not.toContain("<script");
      expect(html).not.toContain("onclick");
      expect(html).not.toContain("navigator.clipboard");
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
      shareUrl: SHARE_URL,
    });

    expect(html).not.toContain("Duración:");
  });
});
