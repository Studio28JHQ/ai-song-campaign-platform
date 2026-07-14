import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

function installSession(session: unknown | null): void {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/leads/session") {
      return session === null
        ? Promise.resolve(jsonResponse({ error: "no_session" }, false, 401))
        : Promise.resolve(jsonResponse(session));
    }
    throw new Error(`Unexpected fetch call to ${url} — the waiting page must never poll.`);
  }) as unknown as typeof fetch;
}

describe("SongResultView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to / when there is no active session", async () => {
    installSession(null);

    render(<SongResultView supportEmail="support@example.com" />);
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
  });

  it("shows the informational waiting message for a QUEUED song, with the disabled 'Generate Another Song' button, and never polls", async () => {
    installSession({
      babyName: "Baby Doe",
      remainingAttempts: 5,
      leadStatus: "GENERATING",
      approvedLyrics: null,
      song: { songId: "song-1", status: "QUEUED" },
    });

    render(<SongResultView supportEmail="support@example.com" />);

    expect(await screen.findByText(/your song has entered production/i)).toBeInTheDocument();
    expect(screen.getByText(/we will notify you by email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate another song/i })).toBeDisabled();
    // Only one call — the single session fetch. No polling endpoint exists.
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("shows the same waiting message for a GENERATING song", async () => {
    installSession({
      babyName: "Baby Doe",
      remainingAttempts: 5,
      leadStatus: "GENERATING",
      approvedLyrics: null,
      song: { songId: "song-1", status: "GENERATING" },
    });

    render(<SongResultView supportEmail="support@example.com" />);

    expect(await screen.findByText(/your song has entered production/i)).toBeInTheDocument();
  });

  it("renders the player, duration, download, and share message once the song is COMPLETED", async () => {
    installSession({
      babyName: "Baby Doe",
      remainingAttempts: 5,
      leadStatus: "GENERATING",
      approvedLyrics: null,
      song: {
        songId: "song-1",
        status: "COMPLETED",
        audioUrl: "https://cdn.example.com/song.mp3",
        duration: 125,
      },
    });

    render(<SongResultView supportEmail="support@example.com" />);

    expect(await screen.findByText(/your personalized song is ready/i)).toBeInTheDocument();
    expect(screen.getByText(/duration: 2:05/i)).toBeInTheDocument();
    expect(screen.getByText(/download song/i)).toBeInTheDocument();
    expect(screen.getByText(/share the joy/i)).toBeInTheDocument();

    const audio = document.querySelector("audio");
    expect(audio).toHaveAttribute("src", "https://cdn.example.com/song.mp3");

    const downloadLink = screen.getByText(/download song/i).closest("a");
    expect(downloadLink).toHaveAttribute("href", "https://cdn.example.com/song.mp3");
    expect(downloadLink).toHaveAttribute("download");
  });

  it("shows a friendly message with support contact for a FAILED song, never internal error detail", async () => {
    installSession({
      babyName: "Baby Doe",
      remainingAttempts: 5,
      leadStatus: "GENERATING",
      approvedLyrics: null,
      song: { songId: "song-1", status: "FAILED" },
    });

    render(<SongResultView supportEmail="support@example.com" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't generate your song/i);
    expect(alert).not.toHaveTextContent(/error|exception|stack/i);
    expect(screen.getByText("support@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate another song/i })).toBeDisabled();
  });

  it("treats a lead with no song yet as QUEUED, without ever calling a generation endpoint", async () => {
    installSession({
      babyName: "Baby Doe",
      remainingAttempts: 5,
      leadStatus: "GENERATING",
      approvedLyrics: null,
      song: null,
    });

    render(<SongResultView supportEmail="support@example.com" />);

    expect(await screen.findByText(/your song has entered production/i)).toBeInTheDocument();
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});
