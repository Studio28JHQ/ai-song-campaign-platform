import { describe, expect, it } from "vitest";
import { ResponseParser } from "@/infrastructure/suno/ResponseParser";

describe("ResponseParser.parse", () => {
  it("parses a valid response", () => {
    const result = ResponseParser.parse({
      id: "suno-123",
      audio_url: "https://cdn.example.com/song.mp3",
      duration: 118.5,
    });

    expect(result).toEqual({
      providerSongId: "suno-123",
      audioUrl: "https://cdn.example.com/song.mp3",
      duration: 118.5,
    });
  });

  it("defaults duration to null when absent", () => {
    const result = ResponseParser.parse({
      id: "suno-123",
      audio_url: "https://cdn.example.com/song.mp3",
    });
    expect(result.duration).toBeNull();
  });

  it("throws when the id is missing", () => {
    expect(() => ResponseParser.parse({ audio_url: "https://cdn.example.com/song.mp3" })).toThrow();
  });

  it("throws when the audio_url is missing", () => {
    expect(() => ResponseParser.parse({ id: "suno-123" })).toThrow();
  });

  it("throws when duration is not a positive number", () => {
    expect(() =>
      ResponseParser.parse({
        id: "suno-123",
        audio_url: "https://cdn.example.com/song.mp3",
        duration: -5,
      }),
    ).toThrow();
  });

  it("throws on a completely unrelated shape", () => {
    expect(() => ResponseParser.parse({ foo: "bar" })).toThrow();
  });

  it("throws on a non-object payload", () => {
    expect(() => ResponseParser.parse("not an object")).toThrow();
  });
});
