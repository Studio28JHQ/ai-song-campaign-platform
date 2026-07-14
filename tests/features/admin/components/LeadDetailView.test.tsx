import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeadDetailView } from "@/features/admin/components/LeadDetailView";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

const fullDetailBody = {
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
  song: {
    id: "song-1",
    leadId: "lead-1",
    lyricsId: "lyrics-1",
    moodId: "mood-1",
    provider: "suno",
    providerSongId: "suno-123",
    audioUrl: "https://cdn.example.com/song.mp3",
    duration: 125,
    status: "READY",
    generatedAt: "2026-01-01T01:00:00.000Z",
    emailedAt: "2026-01-01T01:05:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T01:00:00.000Z",
  },
  auditHistory: [
    {
      id: "audit-1",
      adminId: "admin-1",
      action: "view_lead",
      entity: "Lead",
      entityId: "lead-1",
      metadata: null,
      createdAt: "2026-01-01T02:00:00.000Z",
    },
  ],
};

describe("LeadDetailView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders lead info, lyrics, approved lyrics, song details, download, and audit history — read only", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(fullDetailBody)) as unknown as typeof fetch;

    render(<LeadDetailView leadId="lead-1" />);

    expect(await screen.findByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("+1 555 123 4567")).toBeInTheDocument();
    expect(screen.getAllByText("COMPLETED").length).toBe(2);
    expect(screen.getAllByText(/Title/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Duration: 2:05/)).toBeInTheDocument();
    expect(screen.getByText(/Sent at/)).toBeInTheDocument();
    expect(screen.getByText("view_lead")).toBeInTheDocument();

    const downloadLink = screen.getByText("Download Song").closest("a");
    expect(downloadLink).toHaveAttribute("href", "https://cdn.example.com/song.mp3");
    expect(downloadLink).toHaveAttribute("download");

    const audio = document.querySelector("audio");
    expect(audio).toHaveAttribute("src", "https://cdn.example.com/song.mp3");

    // Read-only: no form, input, or editable control anywhere on the page.
    expect(document.querySelector("form")).toBeNull();
    expect(document.querySelector("input")).toBeNull();
    expect(document.querySelector("button")).toBeNull();
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
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ ...fullDetailBody, song: null, approvedLyrics: null, auditHistory: [] }),
      ) as unknown as typeof fetch;

    render(<LeadDetailView leadId="lead-1" />);

    expect(await screen.findByText("No song generated yet.")).toBeInTheDocument();
    expect(screen.getByText("No approved lyrics yet.")).toBeInTheDocument();
    expect(screen.getByText("No audit entries yet.")).toBeInTheDocument();
  });
});
