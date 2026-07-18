import "dotenv/config";
import { describe, expect, it } from "vitest";
import { SongReadyEmailTemplate } from "@/infrastructure/email/SongReadyEmailTemplate";

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

  it("omits the duration line when duration is not available", () => {
    const html = SongReadyEmailTemplate.html({
      parentName: "Jane Doe",
      babyName: "Baby Doe",
      audioUrl: "https://cdn.example.com/song.mp3",
      duration: null,
    });

    expect(html).not.toContain("Duración:");
  });
});
