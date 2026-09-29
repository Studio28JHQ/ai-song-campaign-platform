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
        providerModel: "mureka-9",
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
  it("shows the provider and its model in their own column", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse(songsResponse({ provider: "lyria", providerModel: "lyria-3.5" })),
      ),
    ) as unknown as typeof fetch;

    render(<SongsList />);

    // Scoped to the table: "Lyria" is also the label of an option in the
    // provider filter, which is not what this asserts.
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Lyria")).toBeInTheDocument();
    expect(within(table).getByText("lyria-3.5")).toBeInTheDocument();
  });

  it("shows a dash, never 'null', for a historical song with no recorded model", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(songsResponse({ provider: "mureka", providerModel: null }))),
    ) as unknown as typeof fetch;

    render(<SongsList />);

    const table = await screen.findByRole("table");
    const providerCell = within(table).getByText("Mureka").closest("td") as HTMLElement;
    // The model sits directly under the provider name, in the same cell.
    expect(within(providerCell).getByText("—")).toBeInTheDocument();
    expect(within(table).queryByText("null")).not.toBeInTheDocument();
    expect(within(table).queryByText("undefined")).not.toBeInTheDocument();
  });

  it("renders an unknown historical provider readably instead of blank", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(songsResponse({ provider: "suno", providerModel: null }))),
    ) as unknown as typeof fetch;

    render(<SongsList />);

    // The legacy value has no friendly label; it must still read clearly.
    const table = await screen.findByRole("table");
    expect(within(table).getByText("suno")).toBeInTheDocument();
  });

  it("asks the server for the selected provider, combined with the status filter", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse(songsResponse())),
    ) as unknown as typeof fetch;
    global.fetch = fetchMock;

    render(<SongsList />);
    await screen.findByRole("table");

    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "COMPLETED" } });
    fireEvent.change(screen.getByLabelText("Proveedor"), { target: { value: "lyria" } });

    await waitFor(() => {
      const urls = (fetchMock as unknown as { mock: { calls: string[][] } }).mock.calls.map(
        (call) => call[0],
      );
      const last = urls[urls.length - 1];
      expect(last).toContain("provider=lyria");
      expect(last).toContain("status=COMPLETED");
    });
  });

  it("drops the provider parameter entirely when 'Todos' is selected", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse(songsResponse())),
    ) as unknown as typeof fetch;
    global.fetch = fetchMock;

    render(<SongsList />);
    await screen.findByRole("table");

    fireEvent.change(screen.getByLabelText("Proveedor"), { target: { value: "lyria" } });
    await waitFor(() => {
      const calls = (fetchMock as unknown as { mock: { calls: string[][] } }).mock.calls;
      expect(calls[calls.length - 1][0]).toContain("provider=lyria");
    });

    fireEvent.change(screen.getByLabelText("Proveedor"), { target: { value: "" } });
    await waitFor(() => {
      const calls = (fetchMock as unknown as { mock: { calls: string[][] } }).mock.calls;
      expect(calls[calls.length - 1][0]).not.toContain("provider=");
    });
  });
});
