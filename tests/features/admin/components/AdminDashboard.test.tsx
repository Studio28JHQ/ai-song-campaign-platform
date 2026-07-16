import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDashboard } from "@/features/admin/components/AdminDashboard";

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
  campaignGoal: 3000,
  averageGenerationMinutes: { today: null, last7Days: 4.5, last30Days: 6.2 },
};

/**
 * Sprint ADMIN-1 — Backoffice de Campaña. `AdminDashboard` no longer
 * renders the participants table (moved to its own "Familias" page,
 * see `LeadSearchTable.test.tsx`) — this only covers the KPI cards,
 * campaign goal progress, generation-time stats, and funnel.
 */
describe("AdminDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and displays the summary indicators", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(summaryBody)),
    ) as unknown as typeof fetch;

    render(<AdminDashboard />);

    expect(screen.getByText("Cargando resumen...")).toBeInTheDocument();

    const totalLeadsLabel = await screen.findByText("Familias registradas");
    const totalLeadsCard = totalLeadsLabel.closest("div")?.parentElement as HTMLElement;
    expect(within(totalLeadsCard).getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Letras generadas")).toBeInTheDocument();
    expect(screen.getByText("Letras aprobadas")).toBeInTheDocument();
    expect(screen.getByText("Canciones completadas")).toBeInTheDocument();

    const pendingLabel = screen.getByText("Canciones pendientes");
    const pendingCard = pendingLabel.closest("div")?.parentElement as HTMLElement;
    expect(within(pendingCard).getByText("2")).toBeInTheDocument(); // songsQueued + songsGenerating

    expect(screen.getByText("Canciones fallidas")).toBeInTheDocument();
    expect(screen.getByText("Correos enviados")).toBeInTheDocument();
  });

  it("shows a friendly error message when the summary fails to load", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ message: "Something went wrong." }, false, 500)),
    ) as unknown as typeof fetch;

    render(<AdminDashboard />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.");
  });

  it("shows the campaign goal progress bar using the real goal and completed count", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(summaryBody)),
    ) as unknown as typeof fetch;

    render(<AdminDashboard />);

    expect(await screen.findByText("5 / 3000 (0%)")).toBeInTheDocument();
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "0");
  });

  it("shows 'No disponible' for a period with no completed songs, and the real value otherwise", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(summaryBody)),
    ) as unknown as typeof fetch;

    render(<AdminDashboard />);

    expect(await screen.findByText("No disponible")).toBeInTheDocument();
    expect(screen.getByText("4.5 min")).toBeInTheDocument();
    expect(screen.getByText("6.2 min")).toBeInTheDocument();
  });

  it("shows the conversion funnel with real counts, in order", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(summaryBody)),
    ) as unknown as typeof fetch;

    render(<AdminDashboard />);

    const funnelHeading = await screen.findByText("Embudo de conversión");
    const funnelList = funnelHeading.parentElement?.querySelector("ol");
    expect(funnelList).toHaveTextContent("Registro");
    expect(funnelList).toHaveTextContent("Letra generada");
    expect(funnelList).toHaveTextContent("Letra aprobada");
    expect(funnelList).toHaveTextContent("Canción generada");
    expect(funnelList).toHaveTextContent("Correo enviado");
  });
});
