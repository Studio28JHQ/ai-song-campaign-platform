import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SongsList } from "@/features/admin/components/SongsList";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function songsResponse(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      {
        id: "song-1",
        leadId: "lead-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        parentName: "Jane Doe",
        babyName: "Baby Doe",
        status: "COMPLETED",
        provider: "mureka",
        audioUrl: "https://signed.example.com/song-1.mp3",
        providerError: null,
        emailedAt: "2026-01-01T01:00:00.000Z",
        ...overrides,
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
  };
}

describe("SongsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true,
    });
  });

  it("shows a colored status badge for the song's status", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(songsResponse({ status: "COMPLETED" }))),
    ) as unknown as typeof fetch;

    render(<SongsList />);

    const table = await screen.findByRole("table");
    const badge = within(table).getByText("Completada");
    expect(badge.className).toContain("bg-success/15");
    expect(badge.className).toContain("text-success");
  });

  it("shows a distinct badge style for a FAILED song", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(songsResponse({ status: "FAILED", emailedAt: null }))),
    ) as unknown as typeof fetch;

    render(<SongsList />);

    const table = await screen.findByRole("table");
    const badge = within(table).getByText("Fallida");
    expect(badge.className).toContain("bg-destructive/15");
    expect(badge.className).toContain("text-destructive");
  });

  it("copies the resolved signed URL to the clipboard, never re-resolving or persisting it", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(songsResponse())),
    ) as unknown as typeof fetch;

    render(<SongsList />);

    const copyButton = await screen.findByRole("button", { name: "Copiar URL" });
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "https://signed.example.com/song-1.mp3",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "¡Copiado!" })).toBeInTheDocument(),
    );
  });

  it("shows a placeholder instead of a copy button when the song has no audio yet", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse(songsResponse({ status: "QUEUED", audioUrl: null, emailedAt: null })),
      ),
    ) as unknown as typeof fetch;

    render(<SongsList />);

    const table = await screen.findByRole("table");
    within(table).getByText("En cola");
    expect(screen.queryByRole("button", { name: "Copiar URL" })).not.toBeInTheDocument();
  });
});
