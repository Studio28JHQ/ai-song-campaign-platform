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
    musicDirection: "Warm acoustic arrangement with gentle piano and ukulele.",
    audioStorageKey: "songs/song-1.mp3",
    providerError: null,
    emailedAt: new Date("2026-01-01T01:00:00.000Z"),
    ...overrides,
  };
}

describe("ListSongsUseCase", () => {
  it("resolves a fresh signed URL for songs that have a storage key", async () => {
    const gate: AdminSongListGate = {
      list: vi.fn().mockResolvedValue({ items: [row()], total: 1 }),
    };
    const resolver: AudioUrlResolver = {
      resolve: vi.fn().mockResolvedValue("https://signed.example/song-1.mp3"),
    };
    const useCase = new ListSongsUseCase(gate, resolver);

    const result = await useCase.execute({ page: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
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
      list: vi
        .fn()
        .mockResolvedValue({ items: [row({ audioStorageKey: null, status: "QUEUED" })], total: 1 }),
    };
    const resolver: AudioUrlResolver = { resolve: vi.fn() };
    const useCase = new ListSongsUseCase(gate, resolver);

    const result = await useCase.execute({ page: 1 });

    expect(result.items[0].audioUrl).toBeNull();
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it("passes providerError through to the response", async () => {
    const gate: AdminSongListGate = {
      list: vi.fn().mockResolvedValue({
        items: [row({ status: "FAILED", providerError: "Provider timed out." })],
        total: 1,
      }),
    };
    const resolver: AudioUrlResolver = { resolve: vi.fn() };
    const useCase = new ListSongsUseCase(gate, resolver);

    const result = await useCase.execute({ page: 1 });

    expect(result.items[0].providerError).toBe("Provider timed out.");
  });

  it("forwards pagination, query, and status filter to the gate", async () => {
    const gate: AdminSongListGate = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const resolver: AudioUrlResolver = { resolve: vi.fn() };
    const useCase = new ListSongsUseCase(gate, resolver);

    await useCase.execute({ page: 2, pageSize: 10, query: "  Jane  ", status: "FAILED" });

    expect(gate.list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      query: "Jane",
      status: "FAILED",
    });
  });

  it("rejects a non-positive page", async () => {
    const gate: AdminSongListGate = { list: vi.fn() };
    const resolver: AudioUrlResolver = { resolve: vi.fn() };
    const useCase = new ListSongsUseCase(gate, resolver);

    await expect(useCase.execute({ page: 0 })).rejects.toThrow();
    expect(gate.list).not.toHaveBeenCalled();
  });

  it("rejects a pageSize over the maximum", async () => {
    const gate: AdminSongListGate = { list: vi.fn() };
    const resolver: AudioUrlResolver = { resolve: vi.fn() };
    const useCase = new ListSongsUseCase(gate, resolver);

    await expect(useCase.execute({ page: 1, pageSize: 1000 })).rejects.toThrow();
    expect(gate.list).not.toHaveBeenCalled();
  });
});
