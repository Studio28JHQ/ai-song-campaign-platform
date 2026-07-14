import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LyricsWorkflow } from "@/features/lyrics/components/LyricsWorkflow";

const pushMock = vi.fn();
const replaceMock = vi.fn();
// A stable object reference matters here: `LyricsWorkflow` depends on
// `router` inside a `useEffect`, and real Next.js returns a memoized
// router — a fresh object per call would make the effect re-run every
// render (state update -> re-render -> new router -> effect -> ...).
const routerMock = { push: pushMock, replace: replaceMock };

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

const DEFAULT_PROPS = { maxAttempts: 5, supportEmail: "support@example.com" };

function renderWorkflow(props: Partial<typeof DEFAULT_PROPS> = {}) {
  return render(<LyricsWorkflow {...DEFAULT_PROPS} {...props} />);
}

function seedSession(remainingAttempts = 5) {
  window.sessionStorage.setItem("leadId", "lead-1");
  window.sessionStorage.setItem("babyName", "Baby Doe");
  window.sessionStorage.setItem("remainingAttempts", String(remainingAttempts));
}

function seedApproval(content = "Title\nVerse 1\n...", version = 1) {
  window.sessionStorage.setItem("approvedLyrics", JSON.stringify({ content, version }));
}

function mockGenerateResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

describe("LyricsWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("redirects to / when there is no registration session", async () => {
    renderWorkflow();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
  });

  it("shows the generation form with baby name and remaining attempts", async () => {
    seedSession(5);
    renderWorkflow();

    expect(await screen.findByText("Baby Doe")).toBeInTheDocument();
    expect(screen.getByText("Remaining attempts: 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate lyrics/i })).toBeInTheDocument();
  });

  it("generates lyrics successfully and shows the review panel", async () => {
    seedSession(5);
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue(
      mockGenerateResponse({
        lyrics: { id: "lyrics-1", content: "Title\nVerse 1\n...", version: 1, approved: true },
        approved: true,
        reason: null,
        remainingAttempts: 5,
        leadStatus: "GENERATING",
      }),
    );

    renderWorkflow();
    await user.type(await screen.findByLabelText(/your message/i), "A gentle bedtime song.");
    await user.click(screen.getByRole("button", { name: /generate lyrics/i }));

    expect(await screen.findByText("Title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve lyrics/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate again/i })).toBeInTheDocument();
  });

  it("shows Attempt X / MAX using the configured maximum, not a hardcoded value", async () => {
    seedSession(5);
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue(
      mockGenerateResponse({
        lyrics: { id: "lyrics-1", content: "Title\nVerse 1\n...", version: 1, approved: true },
        approved: true,
        reason: null,
        remainingAttempts: 5,
        leadStatus: "GENERATING",
      }),
    );

    renderWorkflow({ maxAttempts: 7 });
    await user.type(await screen.findByLabelText(/your message/i), "A gentle bedtime song.");
    await user.click(screen.getByRole("button", { name: /generate lyrics/i }));

    expect(await screen.findByText("Attempt 1 / 7")).toBeInTheDocument();
  });

  it("shows a rejection message and stays on the generation form", async () => {
    seedSession(5);
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue(
      mockGenerateResponse({
        lyrics: null,
        approved: false,
        reason: "Contains offensive language.",
        remainingAttempts: 4,
        leadStatus: "GENERATING",
      }),
    );

    renderWorkflow();
    await user.type(await screen.findByLabelText(/your message/i), "bad content");
    await user.click(screen.getByRole("button", { name: /generate lyrics/i }));

    expect(await screen.findByText("Contains offensive language.")).toBeInTheDocument();
    expect(screen.getByText("Remaining attempts: 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate lyrics/i })).toBeInTheDocument();
  });

  it("consumes an attempt and refreshes the UI on Generate Again", async () => {
    seedSession(5);
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockGenerateResponse({
          lyrics: { id: "lyrics-1", content: "Title\nVerse 1\n...", version: 1, approved: true },
          approved: true,
          reason: null,
          remainingAttempts: 5,
          leadStatus: "GENERATING",
        }),
      )
      .mockResolvedValueOnce(
        mockGenerateResponse({
          lyrics: {
            id: "lyrics-2",
            content: "New Title\nVerse 1\n...",
            version: 2,
            approved: true,
          },
          approved: true,
          reason: null,
          remainingAttempts: 4,
          leadStatus: "GENERATING",
        }),
      );
    global.fetch = fetchMock;

    renderWorkflow();
    await user.type(await screen.findByLabelText(/your message/i), "A gentle bedtime song.");
    await user.click(screen.getByRole("button", { name: /generate lyrics/i }));

    await screen.findByText("Title");
    await user.click(screen.getByRole("button", { name: /generate again/i }));

    expect(await screen.findByText("New Title")).toBeInTheDocument();
    expect(screen.getByText("Remaining attempts: 4")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("approves the lyrics, persists the approval, and navigates to /song", async () => {
    seedSession(5);
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockGenerateResponse({
          lyrics: { id: "lyrics-1", content: "Title\nVerse 1\n...", version: 1, approved: true },
          approved: true,
          reason: null,
          remainingAttempts: 5,
          leadStatus: "GENERATING",
        }),
      )
      .mockResolvedValueOnce(
        mockGenerateResponse({
          lyrics: { id: "lyrics-1", content: "Title\nVerse 1\n...", version: 1, approved: true },
        }),
      );
    global.fetch = fetchMock;

    renderWorkflow();
    await user.type(await screen.findByLabelText(/your message/i), "A gentle bedtime song.");
    await user.click(screen.getByRole("button", { name: /generate lyrics/i }));

    await screen.findByText("Title");
    await user.click(screen.getByRole("button", { name: /approve lyrics/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/song"));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/lyrics/approve",
      expect.objectContaining({ method: "POST" }),
    );
    expect(window.sessionStorage.getItem("approvedLyrics")).toEqual(
      JSON.stringify({ content: "Title\nVerse 1\n...", version: 1 }),
    );
  });

  it("disables Generate Lyrics once remaining attempts reach zero", async () => {
    seedSession(0);
    renderWorkflow();

    expect(await screen.findByRole("button", { name: /generate lyrics/i })).toBeDisabled();
  });

  describe("once a Lyrics version has been approved", () => {
    it("does not show the generation form, mood selector, message textarea, or remaining attempts", async () => {
      seedSession(5);
      seedApproval();
      global.fetch = vi.fn().mockResolvedValue(mockGenerateResponse({ status: "PENDING" }));

      renderWorkflow();

      await screen.findByText("Title");
      expect(screen.queryByRole("button", { name: /generate lyrics/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/selected mood/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/your message/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/remaining attempts/i)).not.toBeInTheDocument();
    });

    it("hides the Generate Again and Approve Lyrics buttons", async () => {
      seedSession(5);
      seedApproval();
      global.fetch = vi.fn().mockResolvedValue(mockGenerateResponse({ status: "PENDING" }));

      renderWorkflow();

      await screen.findByText("Title");
      expect(screen.queryByRole("button", { name: /generate again/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /approve lyrics/i })).not.toBeInTheDocument();
    });

    it("renders the approved lyrics read-only, with no editable control", async () => {
      seedSession(5);
      seedApproval("Title\nLine one\nLine two", 2);
      global.fetch = vi.fn().mockResolvedValue(mockGenerateResponse({ status: "GENERATING" }));

      renderWorkflow();

      expect(await screen.findByText("Title")).toBeInTheDocument();
      expect(screen.getByText(/line one/i)).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("displays Attempt X / MAX using the approved version and the configured maximum", async () => {
      seedSession(5);
      seedApproval("Title\n...", 3);
      global.fetch = vi.fn().mockResolvedValue(mockGenerateResponse({ status: "PENDING" }));

      renderWorkflow({ maxAttempts: 5 });

      expect(await screen.findByText("Attempt 3 / 5")).toBeInTheDocument();
    });

    it("shows the current song status using existing state, not invented state", async () => {
      seedSession(5);
      seedApproval();
      window.sessionStorage.setItem("songId", "song-1");
      global.fetch = vi.fn().mockResolvedValue(mockGenerateResponse({ status: "GENERATING" }));

      renderWorkflow();

      expect(await screen.findByText("Song generating")).toBeInTheDocument();
    });

    it("on failed song generation, shows only the failure message and support email from configuration — never reopening lyrics generation", async () => {
      seedSession(5);
      seedApproval();
      window.sessionStorage.setItem("songId", "song-1");
      global.fetch = vi.fn().mockResolvedValue(mockGenerateResponse({ status: "FAILED" }));

      renderWorkflow({ supportEmail: "help@campaign.example" });

      expect(await screen.findByText("Song generation failed")).toBeInTheDocument();
      expect(screen.getByText("help@campaign.example")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /generate lyrics/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /generate again/i })).not.toBeInTheDocument();
    });
  });
});
