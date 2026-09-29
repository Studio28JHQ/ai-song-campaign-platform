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
  lyricsApprovalRate: 67,
  campaignGoal: 3000,
  songsCompletedToday: 1,
  songsCompletedLast7Days: 3,
  songsCompletedLast30Days: 5,
  registrationsByDay: [
    { date: "2026-01-01", count: 2 },
    { date: "2026-01-02", count: 0 },
  ],
  completedSongsByDay: [
    { date: "2026-01-01", count: 1 },
    { date: "2026-01-02", count: 4 },
  ],
  unavailableSections: [],
};

const activityBody = {
  items: [
    {
      type: "lead_registered",
      timestamp: "2026-01-02T10:00:00.000Z",
      leadId: "lead-1",
      parentName: "Jane Doe",
      babyName: "Baby Doe",
    },
  ],
};

/** Routes `global.fetch` by URL so the Dashboard's two independent endpoints (summary + recent activity) each get their own response. */
function mockFetch(dashboardBody: unknown, activityResponseBody: unknown = { items: [] }) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/admin/activity")) {
      return Promise.resolve(jsonResponse(activityResponseBody));
    }
    return Promise.resolve(jsonResponse(dashboardBody));
  }) as unknown as typeof fetch;
}

/**
 * Sprint ADMIN-1 — Backoffice de Campaña. `AdminDashboard` no longer
 * renders the participants table (moved to its own "Familias" page,
 * see `LeadSearchTable.test.tsx`) — this covers the KPI cards,
 * campaign goal progress, daily trend charts, statistics, funnel, and
 * recent activity (Sprint FINAL-2 — Campaign Operations Dashboard).
 */
describe("AdminDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and displays the summary indicators", async () => {
    global.fetch = mockFetch(summaryBody);

    render(<AdminDashboard />);

    expect(screen.getByLabelText("Cargando el panel")).toBeInTheDocument();

    // Several KPI-card labels are now also used, verbatim, as funnel step
    // labels (per the brief) — the KPI card is always the first DOM match.
    const [totalLeadsLabel] = await screen.findAllByText("Familias registradas");
    const totalLeadsCard = totalLeadsLabel.closest("div")?.parentElement as HTMLElement;
    expect(within(totalLeadsCard).getByText("12")).toBeInTheDocument();
    expect(screen.getAllByText("Letras generadas").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Letras aprobadas").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Canciones completadas").length).toBeGreaterThanOrEqual(1);

    const pendingLabel = screen.getByText("Canciones pendientes");
    const pendingCard = pendingLabel.closest("div")?.parentElement as HTMLElement;
    expect(within(pendingCard).getByText("2")).toBeInTheDocument(); // songsQueued + songsGenerating

    expect(screen.getByText("Canciones fallidas")).toBeInTheDocument();
    expect(screen.getAllByText("Correos enviados").length).toBeGreaterThanOrEqual(1);
  });

  it("shows a friendly error message when the summary fails to load", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ message: "Something went wrong." }, false, 500)),
    ) as unknown as typeof fetch;

    render(<AdminDashboard />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.");
  });

  it("shows the campaign goal progress bar using the real goal and completed count", async () => {
    global.fetch = mockFetch(summaryBody);

    render(<AdminDashboard />);

    expect(await screen.findByText("5 / 3000 (0%)")).toBeInTheDocument();
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "0");
  });

  it("[J] shows the stored completed songs as the campaign's consumption", async () => {
    // Sprint FINAL-6 — Derived Campaign Capacity. This used to read the
    // campaign's `songsGenerated` tally, which only ever goes up: on
    // 2026-09-29 it said 430 while 395 songs were stored, so the bar
    // claimed a consumption that counted deleted songs. The same number
    // the generation gate enforces is now the same number shown here.
    global.fetch = mockFetch({
      ...summaryBody,
      songsCompleted: 395,
      campaignMaximumSongs: 3000,
    });

    render(<AdminDashboard />);

    expect(await screen.findByText("395 / 3000 (13%)")).toBeInTheDocument();
    expect(screen.queryByText(/430 \/ 3000/)).not.toBeInTheDocument();
  });

  it("[J] fills the bar when the stored songs reach the cap", async () => {
    global.fetch = mockFetch({
      ...summaryBody,
      songsCompleted: 3000,
      campaignMaximumSongs: 3000,
    });

    render(<AdminDashboard />);

    expect(await screen.findByText("3000 / 3000 (100%)")).toBeInTheDocument();
  });

  it("no longer shows the average generation time anywhere", async () => {
    // Sprint FINAL-7 — Dashboard Charts. Three cards all reading "1 min"
    // told the operator nothing: the metric is provider latency, rounded
    // to whole minutes, and every song lands at about one. It was removed
    // from the flow rather than hidden, so there is nothing left to show.
    global.fetch = mockFetch(summaryBody);

    render(<AdminDashboard />);

    await screen.findByText("Estadísticas");
    expect(screen.queryByText("Tiempo promedio de generación")).not.toBeInTheDocument();
    expect(screen.queryByText("No disponible")).not.toBeInTheDocument();
    expect(screen.queryByText(/ min$/)).not.toBeInTheDocument();
    // The statistics the brief keeps are all still there.
    expect(screen.getByText("Canciones hoy")).toBeInTheDocument();
    expect(screen.getByText("Canciones últimos 7 días")).toBeInTheDocument();
    expect(screen.getByText("Canciones últimos 30 días")).toBeInTheDocument();
    expect(screen.getByText("Aprobación de letras")).toBeInTheDocument();
    expect(screen.getByText("Éxito de canciones")).toBeInTheDocument();
  });

  it("shows the conversion funnel with the exact steps named in the brief, in order", async () => {
    global.fetch = mockFetch(summaryBody);

    render(<AdminDashboard />);

    const funnelHeading = await screen.findByText("Embudo de conversión");
    const funnelList = funnelHeading.closest("section")?.querySelector("ol");
    expect(funnelList).toHaveTextContent("Familias registradas");
    expect(funnelList).toHaveTextContent("Letras generadas");
    expect(funnelList).toHaveTextContent("Letras aprobadas");
    expect(funnelList).toHaveTextContent("Canciones completadas");
    expect(funnelList).toHaveTextContent("Correos enviados");
  });

  it("shows the statistics KPI cards named in the brief", async () => {
    global.fetch = mockFetch(summaryBody);

    render(<AdminDashboard />);

    await screen.findByText("Estadísticas");
    expect(screen.getByText("Canciones hoy")).toBeInTheDocument();
    expect(screen.getByText("Canciones últimos 7 días")).toBeInTheDocument();
    expect(screen.getByText("Canciones últimos 30 días")).toBeInTheDocument();
    expect(screen.getByText("Aprobación de letras")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
    expect(screen.getByText("Éxito de canciones")).toBeInTheDocument();
    expect(screen.getByText("63%")).toBeInTheDocument();
  });

  it("shows the two 30-day daily trend charts with their totals", async () => {
    global.fetch = mockFetch(summaryBody);

    render(<AdminDashboard />);

    expect(await screen.findByText("Registros por día (últimos 30 días)")).toBeInTheDocument();
    expect(screen.getByText("Canciones completadas por día (últimos 30 días)")).toBeInTheDocument();
    expect(screen.getAllByText("Total: 2")).toHaveLength(1); // registrationsByDay: 2 + 0
    expect(screen.getAllByText("Total: 5")).toHaveLength(1); // completedSongsByDay: 1 + 4
  });

  it("shows recent activity events, reusing existing Lead/Lyrics/Song data", async () => {
    global.fetch = mockFetch(summaryBody, activityBody);

    render(<AdminDashboard />);

    await screen.findByText("Actividad reciente");
    expect(await screen.findByText(/Nueva familia/)).toBeInTheDocument();
    expect(screen.getByText("Jane Doe · Baby Doe")).toBeInTheDocument();
  });

  it("shows an empty-state message when there is no recent activity", async () => {
    global.fetch = mockFetch(summaryBody, { items: [] });

    render(<AdminDashboard />);

    expect(await screen.findByText("Aún no hay actividad registrada")).toBeInTheDocument();
  });

  it("renders the rest of the Dashboard and shows a localized error only on the affected widget when one section failed (Sprint FINAL-3)", async () => {
    global.fetch = mockFetch({ ...summaryBody, unavailableSections: ["campaign"] });

    render(<AdminDashboard />);

    // The failed widget shows a localized error...
    await screen.findByText("Meta de la campaña");
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((alert) => alert.textContent?.includes("No fue posible cargar"))).toBe(true);
    // ...while every other widget still renders normally.
    expect(screen.getByText("Estadísticas")).toBeInTheDocument();
    expect(screen.getByText("Embudo de conversión")).toBeInTheDocument();
    const [totalLeadsLabel] = screen.getAllByText("Familias registradas");
    expect(totalLeadsLabel).toBeInTheDocument();
  });

  it("never shows a section error when unavailableSections is empty", async () => {
    global.fetch = mockFetch(summaryBody);

    render(<AdminDashboard />);

    await screen.findByText("Meta de la campaña");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
