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

const summaryBody = { totalLeads: 12, songsCompleted: 5, songsPending: 4, songsFailed: 3 };
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

  it("loads and displays the four summary cards", async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.startsWith("/api/admin/dashboard")) return Promise.resolve(jsonResponse(summaryBody));
      return Promise.resolve(jsonResponse(searchBody));
    }) as unknown as typeof fetch;

    render(<AdminDashboard />);

    expect(screen.getByText("Loading summary...")).toBeInTheDocument();

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("Total Leads")).toBeInTheDocument();
    expect(screen.getByText("Songs Completed")).toBeInTheDocument();
    expect(screen.getByText("Songs Pending")).toBeInTheDocument();
    expect(screen.getByText("Songs Failed")).toBeInTheDocument();
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
    expect(screen.getByText("Sent")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/search participants/i), "jane");

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain("q=jane");
    });
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
