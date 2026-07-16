import { describe, expect, it, vi } from "vitest";
import { ListSongsUseCase } from "@/application/admin/use-cases/ListSongsUseCase";
import type {
  AdminSongListGate,
  AdminSongRow,
} from "@/application/admin/contracts/AdminSongListGate";
import type { AudioUrlResolver } from "@/application/song/contracts/AudioUrlResolver";

function row(overrides: Partial<AdminSongRow> = {}): AdminSongRow {
  return {
    id: "song-1",
    leadId: "lead-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    parentName: "Jane Doe",
    babyName: "Baby Doe",
    status: "COMPLETED",
    provider: "mureka",
    audioStorageKey: "songs/song-1.mp3",
    emailedAt: new Date("2026-01-01T01:00:00.000Z"),
    ...overrides,
  };
}

describe("ListSongsUseCase", () => {
  it("resolves a fresh signed URL for songs that have a storage key", async () => {
    const gate: AdminSongListGate = { list: vi.fn().mockResolvedValue([row()]) };
    const resolver: AudioUrlResolver = {
      resolve: vi.fn().mockResolvedValue("https://signed.example/song-1.mp3"),
    };
    const useCase = new ListSongsUseCase(gate, resolver);

    const result = await useCase.execute();

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "song-1",
      status: "COMPLETED",
      provider: "mureka",
      audioUrl: "https://signed.example/song-1.mp3",
    });
    expect(resolver.resolve).toHaveBeenCalledWith("songs/song-1.mp3");
  });

  it("never calls the resolver, and returns a null audioUrl, when there is no storage key", async () => {
    const gate: AdminSongListGate = {
      list: vi.fn().mockResolvedValue([row({ audioStorageKey: null, status: "QUEUED" })]),
    };
    const resolver: AudioUrlResolver = { resolve: vi.fn() };
    const useCase = new ListSongsUseCase(gate, resolver);

    const result = await useCase.execute();

    expect(result.items[0].audioUrl).toBeNull();
    expect(resolver.resolve).not.toHaveBeenCalled();
  });
});
