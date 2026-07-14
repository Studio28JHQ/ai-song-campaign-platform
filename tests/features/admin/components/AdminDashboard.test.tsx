import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDashboard } from "@/features/admin/components/AdminDashboard";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

const summaryBody = {
  totalLeads: 12,
  lyricsGenerated: 15,
  lyricsApproved: 10,
  songsRequested: 8,
  songsQueued: 1,
  songsGenerating: 1,
  songsCompleted: 5,
  songsFailed: 3,
  emailsSent: 5,
  emailsResent: 2,
  generationSuccessRate: 63,
};
const searchBody = {
  items: [
    {
      id: "lead-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      parentName: "Jane Doe",
      babyName: "Baby Doe",
      email: "jane@example.com",
      phone: null,
      songStatus: "COMPLETED",
      emailSent: true,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
};

describe("AdminDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and displays the summary indicators", async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.startsWith("/api/admin/dashboard")) return Promise.resolve(jsonResponse(summaryBody));
      return Promise.resolve(jsonResponse(searchBody));
    }) as unknown as typeof fetch;

    render(<AdminDashboard />);

    expect(screen.getByText("Loading summary...")).toBeInTheDocument();

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("Total Leads")).toBeInTheDocument();
    expect(screen.getByText("Lyrics Generated")).toBeInTheDocument();
    expect(screen.getByText("Lyrics Approved")).toBeInTheDocument();
    expect(screen.getByText("Songs Requested")).toBeInTheDocument();
    expect(screen.getByText("Songs Queued")).toBeInTheDocument();
    expect(screen.getByText("Songs Generating")).toBeInTheDocument();
    expect(screen.getByText("Songs Completed")).toBeInTheDocument();
    expect(screen.getByText("Songs Failed")).toBeInTheDocument();
    expect(screen.getByText("Emails Sent")).toBeInTheDocument();
    expect(screen.getByText("Email Resent")).toBeInTheDocument();
    expect(screen.getByText("Generation Success Rate")).toBeInTheDocument();
    expect(screen.getByText("63%")).toBeInTheDocument();
  });

  it("shows a friendly error message when the summary fails to load", async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.startsWith("/api/admin/dashboard")) {
        return Promise.resolve(jsonResponse({ message: "Something went wrong." }, false, 500));
      }
      return Promise.resolve(jsonResponse(searchBody));
    }) as unknown as typeof fetch;

    render(<AdminDashboard />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.");
  });

  it("searches participants and renders matching rows in the table", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("/api/admin/dashboard")) return Promise.resolve(jsonResponse(summaryBody));
      return Promise.resolve(jsonResponse(searchBody));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminDashboard />);

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Baby Doe")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
    const row = screen.getByText("jane@example.com").closest("tr");
    expect(row).toHaveTextContent("Sent");

    await user.type(screen.getByLabelText(/search participants/i), "jane");

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain("q=jane");
    });
  });

  it("combines filters with the search query, and points the export link at the same filters", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("/api/admin/dashboard")) return Promise.resolve(jsonResponse(summaryBody));
      return Promise.resolve(jsonResponse(searchBody));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminDashboard />);
    await screen.findByText("Jane Doe");

    await user.selectOptions(screen.getByLabelText("Song status"), "FAILED");
    await user.selectOptions(screen.getByLabelText("Email status"), "NOT_SENT");
    await user.type(screen.getByLabelText("City"), "Austin");

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain("songStatus=FAILED");
      expect(lastCall).toContain("emailStatus=NOT_SENT");
      expect(lastCall).toContain("city=Austin");
    });

    const exportLink = screen.getByRole("link", { name: "Export CSV" });
    const href = exportLink.getAttribute("href") ?? "";
    expect(href).toContain("/api/admin/leads/export");
    expect(href).toContain("songStatus=FAILED");
    expect(href).toContain("emailStatus=NOT_SENT");
    expect(href).toContain("city=Austin");
  });

  it("links each row to the read-only lead detail page", async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.startsWith("/api/admin/dashboard")) return Promise.resolve(jsonResponse(summaryBody));
      return Promise.resolve(jsonResponse(searchBody));
    }) as unknown as typeof fetch;

    render(<AdminDashboard />);

    const link = await screen.findByRole("link", { name: /view/i });
    expect(link).toHaveAttribute("href", "/admin/leads/lead-1");
  });
});
