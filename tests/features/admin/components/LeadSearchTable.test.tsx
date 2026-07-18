import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeadSearchTable } from "@/features/admin/components/LeadSearchTable";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

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

/**
 * Sprint ADMIN-1 — Backoffice de Campaña. `LeadSearchTable` moved from
 * the Dashboard to its own "Familias" page — these search/filter/export
 * behaviors used to be exercised via `AdminDashboard.test.tsx`; moved
 * here so they're tested against the component directly, matching
 * where the production code now actually renders it.
 */
describe("LeadSearchTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searches families and renders matching rows in the table", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<ReturnType<typeof jsonResponse>>>(
      () => Promise.resolve(jsonResponse(searchBody)),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<LeadSearchTable />);

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Baby Doe")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Completada")).toBeInTheDocument();
    const row = screen.getByText("jane@example.com").closest("tr");
    expect(row).toHaveTextContent("Enviado");

    await user.type(screen.getByLabelText(/buscar familias/i), "jane");

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain("q=jane");
    });
  });

  it("combines filters with the search query, and points the export link at the same filters", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<ReturnType<typeof jsonResponse>>>(
      () => Promise.resolve(jsonResponse(searchBody)),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<LeadSearchTable />);
    await screen.findByText("Jane Doe");

    await user.selectOptions(screen.getByLabelText("Estado"), "FAILED");
    await user.selectOptions(screen.getByLabelText("Correo"), "NOT_SENT");
    await user.type(screen.getByLabelText("Ciudad"), "Austin");

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain("songStatus=FAILED");
      expect(lastCall).toContain("emailStatus=NOT_SENT");
      expect(lastCall).toContain("city=Austin");
    });

    const exportLink = screen.getByRole("link", { name: "Exportar CSV" });
    const href = exportLink.getAttribute("href") ?? "";
    expect(href).toContain("/api/admin/leads/export");
    expect(href).toContain("songStatus=FAILED");
    expect(href).toContain("emailStatus=NOT_SENT");
    expect(href).toContain("city=Austin");
  });

  it("links each row to the read-only lead detail page", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(searchBody)),
    ) as unknown as typeof fetch;

    render(<LeadSearchTable />);

    const link = await screen.findByRole("link", { name: /ver/i });
    expect(link).toHaveAttribute("href", "/admin/leads/lead-1");
  });

  it("shows an empty state when no families match", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ items: [], total: 0, page: 1, pageSize: 20 })),
    ) as unknown as typeof fetch;

    render(<LeadSearchTable />);

    expect(await screen.findByText("No se encontraron familias")).toBeInTheDocument();
  });
});
