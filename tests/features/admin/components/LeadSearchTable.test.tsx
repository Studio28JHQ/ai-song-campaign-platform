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
  /**
   * Sprint FINAL-5 — Test Data Cleanup.
   */
  it("shows the registration time to the second, so families from the same day are distinguishable", async () => {
    const sameDay = {
      ...searchBody,
      items: [
        {
          ...searchBody.items[0],
          id: "lead-a",
          parentName: "Ana Ruiz",
          createdAt: "2026-09-29T16:47:32.000Z",
        },
        {
          ...searchBody.items[0],
          id: "lead-b",
          parentName: "Beto Paz",
          createdAt: "2026-09-29T16:47:58.000Z",
        },
      ],
      total: 2,
    };
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(sameDay)) as unknown as typeof fetch;

    render(<LeadSearchTable />);

    // Same date, different second — the whole point of the column.
    expect(await screen.findByText("29/09/2026 11:47:32")).toBeInTheDocument();
    expect(screen.getByText("29/09/2026 11:47:58")).toBeInTheDocument();
  });

  it("renders the timestamp in the campaign's timezone, not UTC and not the viewer's", async () => {
    // 16:47:32 UTC is 11:47:32 in America/Guayaquil (UTC-5). Asserting
    // the converted value is what pins the timezone: a UTC render would
    // read 16:47:32, and a render left to the machine's own zone would
    // move with it. What is stored stays UTC either way.
    const atNoonUtc = {
      ...searchBody,
      items: [{ ...searchBody.items[0], createdAt: "2026-09-29T16:47:32.000Z" }],
    };
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(atNoonUtc)) as unknown as typeof fetch;

    render(<LeadSearchTable />);

    expect(await screen.findByText("29/09/2026 11:47:32")).toBeInTheDocument();
    expect(screen.queryByText("29/09/2026 16:47:32")).not.toBeInTheDocument();
  });

  it("crosses the day boundary the way the campaign experiences it", async () => {
    // Just after midnight UTC is still the previous evening in Ecuador,
    // and the column has to say so or the date is wrong for the operator.
    const justAfterMidnightUtc = {
      ...searchBody,
      items: [{ ...searchBody.items[0], createdAt: "2026-09-29T00:05:09.000Z" }],
    };
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(justAfterMidnightUtc)) as unknown as typeof fetch;

    render(<LeadSearchTable />);

    expect(await screen.findByText("28/09/2026 19:05:09")).toBeInTheDocument();
  });

  it("asks for confirmation before deleting, naming the family and what goes with it", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(searchBody)) as unknown as typeof fetch;

    render(<LeadSearchTable />);
    await screen.findByText("Jane Doe");

    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    // The family is identified, not merely "are you sure?": the names and
    // the email now appear twice — once in the row, once in the
    // confirmation that repeats them back.
    expect(screen.getAllByText("Jane Doe")).toHaveLength(2);
    expect(screen.getAllByText("Baby Doe")).toHaveLength(2);
    expect(screen.getAllByText(/jane@example\.com/)).toHaveLength(2);
    expect(screen.getByText(/su canción/)).toBeInTheDocument();
    expect(screen.getByText(/no se puede deshacer/i)).toBeInTheDocument();
  });

  it("deletes nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(searchBody));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<LeadSearchTable />);
    await screen.findByText("Jane Doe");

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>;
    expect(calls.some((call) => call[1]?.method === "DELETE")).toBe(false);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("[10] deletes on confirmation, then reloads the list so the total is recalculated", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return Promise.resolve(jsonResponse({ deleted: { id: "lead-1", songCount: 1 } }));
      }
      // After the deletion the list is empty, and the total says so.
      const calledBefore = fetchMock.mock.calls.filter(
        (call: unknown[]) => (call[1] as RequestInit | undefined)?.method !== "DELETE",
      ).length;
      return Promise.resolve(
        jsonResponse(calledBefore > 1 ? { ...searchBody, items: [], total: 0 } : searchBody),
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<LeadSearchTable />);
    await screen.findByText("Jane Doe");

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar eliminación" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/Se eliminó a Jane Doe/);
    await waitFor(() => expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument());

    const deleteCall = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).find(
      (call) => call[1]?.method === "DELETE",
    );
    expect(deleteCall?.[0]).toBe("/api/admin/leads/lead-1");
  });

  it("keeps the family visible and reports the failure when the deletion does not succeed", async () => {
    const user = userEvent.setup();
    global.fetch = vi
      .fn()
      .mockImplementation((_url: string, init?: RequestInit) =>
        Promise.resolve(
          init?.method === "DELETE"
            ? jsonResponse(
                { error: "internal_error", message: "No se pudo eliminar la familia." },
                false,
                500,
              )
            : jsonResponse(searchBody),
        ),
      ) as unknown as typeof fetch;

    render(<LeadSearchTable />);
    await screen.findByText("Jane Doe");

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar eliminación" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/No se pudo eliminar/);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });
});
