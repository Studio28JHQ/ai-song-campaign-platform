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

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

/**
 * `useSongResult` now calls two different endpoints — `GET
 * /api/leads/session` (the backend authority, see GATE 6.6) and the Song
 * endpoints — so the fetch mock must dispatch by URL rather than
 * returning one fixed response for every call.
 */
function routedFetch(options: { session?: unknown | null; songResponses?: unknown[] }) {
  const songQueue = [...(options.songResponses ?? [])];

  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);

    if (url === "/api/leads/session") {
      return options.session === null || options.session === undefined
        ? Promise.resolve(jsonResponse({ error: "no_session" }, false, 401))
        : Promise.resolve(jsonResponse(options.session));
    }

    const next = songQueue.shift();
    return Promise.resolve(jsonResponse(next ?? {}));
  });
}

function install(mock: object): void {
  global.fetch = mock as unknown as typeof fetch;
}

function fetchMock(): ReturnType<typeof vi.fn> {
  return global.fetch as unknown as ReturnType<typeof vi.fn>;
}

describe("SongResultView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("redirects to / when there is no active session", async () => {
    install(routedFetch({ session: null }));

    render(<SongResultView supportEmail="support@example.com" />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
  });

  it("starts generation and shows a loading indicator with the disabled 'Generate Another Song' button", async () => {
    install(
      routedFetch({
        session: {
          babyName: "Baby Doe",
          remainingAttempts: 5,
          leadStatus: "GENERATING",
          approvedLyrics: null,
          song: null,
        },
        songResponses: [{ songId: "song-1", status: "PENDING", estimatedNextAction: "poll me" }],
      }),
    );

    render(<SongResultView supportEmail="support@example.com" />);

    expect(
      await screen.findByRole("status", { name: /generating your song/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate another song/i })).toBeDisabled();
  });

  it("polls every 5 seconds and stops immediately once COMPLETED, rendering the player, duration, download, and share message", async () => {
    vi.useFakeTimers();

    install(
      routedFetch({
        session: {
          babyName: "Baby Doe",
          remainingAttempts: 5,
          leadStatus: "GENERATING",
          approvedLyrics: null,
          song: null,
        },
        songResponses: [
          { songId: "song-1", status: "PENDING", estimatedNextAction: "poll me" },
          { songId: "song-1", status: "GENERATING" },
          {
            songId: "song-1",
            status: "COMPLETED",
            audioUrl: "https://cdn.example.com/song.mp3",
            duration: 125,
          },
        ],
      }),
    );

    render(<SongResultView supportEmail="support@example.com" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByText(/your personalized song is ready/i)).toBeInTheDocument();
    expect(screen.getByText(/duration: 2:05/i)).toBeInTheDocument();
    expect(screen.getByText(/download song/i)).toBeInTheDocument();
    expect(screen.getByText(/share the joy/i)).toBeInTheDocument();

    const audio = document.querySelector("audio");
    expect(audio).toHaveAttribute("src", "https://cdn.example.com/song.mp3");

    const downloadLink = screen.getByText(/download song/i).closest("a");
    expect(downloadLink).toHaveAttribute("href", "https://cdn.example.com/song.mp3");
    expect(downloadLink).toHaveAttribute("download");

    const callsAfterCompletion = fetchMock().mock.calls.length;

    // No WebSocket/SSE — polling is the only mechanism, and it must not
    // keep going once the song reached a terminal status.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(fetchMock().mock.calls.length).toBe(callsAfterCompletion);
  });

  it("stops polling on FAILED and shows a friendly message with support contact, never internal error detail", async () => {
    vi.useFakeTimers();

    install(
      routedFetch({
        session: {
          babyName: "Baby Doe",
          remainingAttempts: 5,
          leadStatus: "GENERATING",
          approvedLyrics: null,
          song: null,
        },
        songResponses: [
          { songId: "song-1", status: "PENDING", estimatedNextAction: "poll me" },
          { songId: "song-1", status: "FAILED" },
        ],
      }),
    );

    render(<SongResultView supportEmail="support@example.com" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/couldn't generate your song/i);
    expect(alert).not.toHaveTextContent(/error|exception|stack/i);
    expect(screen.getByText("support@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate another song/i })).toBeDisabled();

    const callsAfterFailure = fetchMock().mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(fetchMock().mock.calls.length).toBe(callsAfterFailure);
  });

  it("resumes polling the song already recorded in backend session state, instead of starting a new generation", async () => {
    vi.useFakeTimers();

    const generateFetch = vi.fn();
    install(
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url === "/api/leads/session") {
          return Promise.resolve(
            jsonResponse({
              babyName: "Baby Doe",
              remainingAttempts: 5,
              leadStatus: "GENERATING",
              approvedLyrics: null,
              song: {
                songId: "song-1",
                status: "GENERATING",
              },
            }),
          );
        }

        if (url === "/api/song/generate") {
          generateFetch();
          return Promise.resolve(jsonResponse({}));
        }

        return Promise.resolve(
          jsonResponse({
            songId: "song-1",
            status: "COMPLETED",
            audioUrl: "https://cdn.example.com/song.mp3",
            duration: 60,
          }),
        );
      }),
    );

    render(<SongResultView supportEmail="support@example.com" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(generateFetch).not.toHaveBeenCalled();
    expect(fetchMock()).toHaveBeenCalledWith("/api/song/song-1");
  });
});
