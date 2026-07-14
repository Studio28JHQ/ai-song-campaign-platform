import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SongResultView } from "@/features/song/components/SongResultView";

const pushMock = vi.fn();
const replaceMock = vi.fn();
// A stable object reference matters here: the underlying hook depends on
// `router` inside a `useEffect` — see LyricsWorkflow.test.tsx for the same
// convention.
const routerMock = { push: pushMock, replace: replaceMock };

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

function seedSession() {
  window.sessionStorage.setItem("leadId", "lead-1");
  window.sessionStorage.setItem("babyName", "Baby Doe");
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

describe("SongResultView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("redirects to / when there is no registration session", async () => {
    render(<SongResultView supportEmail="support@example.com" />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
  });

  it("starts generation and shows a loading indicator with the disabled 'Generate Another Song' button", async () => {
    seedSession();
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ songId: "song-1", status: "PENDING", estimatedNextAction: "poll me" }),
      );

    render(<SongResultView supportEmail="support@example.com" />);

    expect(
      await screen.findByRole("status", { name: /generating your song/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate another song/i })).toBeDisabled();
  });

  it("polls every 5 seconds and stops immediately once COMPLETED, rendering the player, duration, download, and share message", async () => {
    seedSession();
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ songId: "song-1", status: "PENDING", estimatedNextAction: "poll me" }),
      )
      .mockResolvedValueOnce(jsonResponse({ songId: "song-1", status: "GENERATING" }))
      .mockResolvedValueOnce(
        jsonResponse({
          songId: "song-1",
          status: "COMPLETED",
          audioUrl: "https://cdn.example.com/song.mp3",
          duration: 125,
        }),
      );
    global.fetch = fetchMock;

    render(<SongResultView supportEmail="support@example.com" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    expect(screen.getByText(/your personalized song is ready/i)).toBeInTheDocument();
    expect(screen.getByText(/duration: 2:05/i)).toBeInTheDocument();
    expect(screen.getByText(/download song/i)).toBeInTheDocument();
    expect(screen.getByText(/share the joy/i)).toBeInTheDocument();

    const audio = document.querySelector("audio");
    expect(audio).toHaveAttribute("src", "https://cdn.example.com/song.mp3");

    const downloadLink = screen.getByText(/download song/i).closest("a");
    expect(downloadLink).toHaveAttribute("href", "https://cdn.example.com/song.mp3");
    expect(downloadLink).toHaveAttribute("download");

    // No WebSocket/SSE — polling is the only mechanism, and it must not
    // keep going once the song reached a terminal status.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops polling on FAILED and shows a friendly message with support contact, never internal error detail", async () => {
    seedSession();
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ songId: "song-1", status: "PENDING", estimatedNextAction: "poll me" }),
      )
      .mockResolvedValueOnce(jsonResponse({ songId: "song-1", status: "FAILED" }));
    global.fetch = fetchMock;

    render(<SongResultView supportEmail="support@example.com" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/couldn't generate your song/i);
    expect(alert).not.toHaveTextContent(/error|exception|stack/i);
    expect(screen.getByText("support@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate another song/i })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resumes polling an existing songId from a previous visit instead of starting a new generation", async () => {
    seedSession();
    window.sessionStorage.setItem("songId", "song-1");
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        songId: "song-1",
        status: "COMPLETED",
        audioUrl: "https://cdn.example.com/song.mp3",
        duration: 60,
      }),
    );
    global.fetch = fetchMock;

    render(<SongResultView supportEmail="support@example.com" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/song/song-1");
  });
});
