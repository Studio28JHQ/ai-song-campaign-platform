import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeadDetailView } from "@/features/admin/components/LeadDetailView";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function buildDetailBody(overrides: { song?: Record<string, unknown> | null } = {}) {
  return {
    lead: {
      id: "lead-1",
      campaignId: "campaign-1",
      parentName: "Jane Doe",
      babyName: "Baby Doe",
      babyAge: 6,
      city: "Austin",
      email: "jane@example.com",
      phone: "+1 555 123 4567",
      remainingAttempts: 4,
      status: "COMPLETED",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    lyricsHistory: [
      {
        id: "lyrics-1",
        leadId: "lead-1",
        moodId: "mood-1",
        prompt: "prompt",
        content: "Title\nVerse 1",
        approved: true,
        rejectionReason: null,
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    approvedLyrics: {
      id: "lyrics-1",
      leadId: "lead-1",
      moodId: "mood-1",
      prompt: "prompt",
      content: "Title\nVerse 1",
      approved: true,
      rejectionReason: null,
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    song:
      overrides.song === null
        ? null
        : {
            id: "song-1",
            leadId: "lead-1",
            lyricsId: "lyrics-1",
            moodId: "mood-1",
            provider: "suno",
            providerSongId: "suno-123",
            audioUrl: "https://cdn.example.com/song.mp3",
            duration: 125,
            status: "COMPLETED",
            generatedAt: "2026-01-01T01:00:00.000Z",
            emailedAt: "2026-01-01T01:05:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T01:00:00.000Z",
            ...overrides.song,
          },
    executionHistory: [
      {
        type: "song_retried",
        label: "Retry executed",
        timestamp: "2026-01-01T02:00:00.000Z",
        actor: "admin-1",
      },
    ],
  };
}

describe("LeadDetailView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders lead info, lyrics, approved lyrics, song details, download, and execution history", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(buildDetailBody())) as unknown as typeof fetch;

    render(<LeadDetailView leadId="lead-1" />);

    expect(await screen.findByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("+1 555 123 4567")).toBeInTheDocument();
    expect(screen.getAllByText("COMPLETED").length).toBe(2);
    expect(screen.getByText(/Duration: 2:05/)).toBeInTheDocument();
    expect(screen.getByText(/Sent at/)).toBeInTheDocument();
    expect(screen.getByText("Retry executed")).toBeInTheDocument();
    expect(screen.getByText(/by admin-1/)).toBeInTheDocument();

    const downloadLink = screen.getByText("Download Song").closest("a");
    expect(downloadLink).toHaveAttribute("href", "https://cdn.example.com/song.mp3");
    expect(downloadLink).toHaveAttribute("download");
  });

  it("shows a not-found message for a missing lead", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: "lead_not_found", message: "Lead not found." }, false, 404),
      ) as unknown as typeof fetch;

    render(<LeadDetailView leadId="missing" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("This lead could not be found.");
  });

  it("shows placeholders when there is no song or approved lyrics yet", async () => {
    const body = buildDetailBody({ song: null });
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ ...body, approvedLyrics: null, executionHistory: [] }),
      ) as unknown as typeof fetch;

    render(<LeadDetailView leadId="lead-1" />);

    expect(await screen.findByText("No song generated yet.")).toBeInTheDocument();
    expect(screen.getByText("No approved lyrics yet.")).toBeInTheDocument();
    expect(screen.getByText("No history yet.")).toBeInTheDocument();
  });

  it("shows Retry Generation only for a FAILED song, and confirms before retrying", async () => {
    const user = userEvent.setup();
    const detailBody = buildDetailBody({
      song: { status: "FAILED", audioUrl: null, emailedAt: null },
    });
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/retry"))
        return Promise.resolve(jsonResponse({ songId: "song-1", status: "QUEUED" }));
      return Promise.resolve(jsonResponse(detailBody));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<LeadDetailView leadId="lead-1" />);

    const retryButton = await screen.findByRole("button", { name: "Retry Generation" });
    expect(screen.queryByRole("button", { name: "Resend Email" })).not.toBeInTheDocument();

    await user.click(retryButton);
    expect(await screen.findByText(/reused as-is/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm Retry" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/Retry started/);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/songs/song-1/retry", { method: "POST" }),
    );
    // A refetch of the detail data happens after a successful retry.
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/admin/leads/lead-1").length).toBe(2),
    );
  });

  it("shows Resend Email only once COMPLETED and already emailed, requires a reason, and confirms before sending", async () => {
    const user = userEvent.setup();
    const detailBody = buildDetailBody();
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/resend-email")) return Promise.resolve(jsonResponse({ success: true }));
      return Promise.resolve(jsonResponse(detailBody));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<LeadDetailView leadId="lead-1" />);

    const resendButton = await screen.findByRole("button", { name: "Resend Email" });
    expect(screen.queryByRole("button", { name: "Retry Generation" })).not.toBeInTheDocument();

    await user.click(resendButton);
    await user.click(screen.getByRole("button", { name: "Confirm Resend" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please provide a reason");

    await user.type(screen.getByLabelText("Reason for resending"), "Parent never got it.");
    await user.click(screen.getByRole("button", { name: "Confirm Resend" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/resent successfully/i);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const resendCall = calls.find((c) => c[0].includes("/resend-email"));
    expect(resendCall).toBeDefined();
    const init = resendCall?.[1];
    expect(JSON.parse(init?.body as string)).toEqual({ reason: "Parent never got it." });
  });

  it("shows neither Retry nor Resend for a song still in progress", async () => {
    const detailBody = buildDetailBody({
      song: { status: "GENERATING", audioUrl: null, emailedAt: null },
    });
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(detailBody)) as unknown as typeof fetch;

    render(<LeadDetailView leadId="lead-1" />);

    await screen.findByText("jane@example.com");
    expect(screen.queryByRole("button", { name: "Retry Generation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resend Email" })).not.toBeInTheDocument();
  });
});
