export interface AverageGenerationMinutes {
  today: number | null;
  last7Days: number | null;
  last30Days: number | null;
}

export interface DailyCount {
  date: string;
  count: number;
}

export type DashboardSection =
  "core" | "generationTime" | "campaign" | "windowCounts" | "dailyTrends";

export interface DashboardSummary {
  totalLeads: number;
  lyricsGenerated: number;
  lyricsApproved: number;
  songsRequested: number;
  songsQueued: number;
  songsGenerating: number;
  songsCompleted: number;
  songsFailed: number;
  emailsSent: number;
  emailsResent: number;
  generationSuccessRate: number;
  lyricsApprovalRate: number;
  campaignGoal: number;
  averageGenerationMinutes: AverageGenerationMinutes;
  campaignMaximumSongs: number | null;
  campaignSongsGenerated: number | null;
  songsCompletedToday: number;
  songsCompletedLast7Days: number;
  songsCompletedLast30Days: number;
  registrationsByDay: DailyCount[];
  completedSongsByDay: DailyCount[];
  unavailableSections: DashboardSection[];
}

export class GetDashboardSummaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GetDashboardSummaryError";
  }
}

/** Thin HTTP client for `GET /api/admin/dashboard`. No business rule is evaluated here. */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  let response: Response;

  try {
    response = await fetch("/api/admin/dashboard");
  } catch {
    throw new GetDashboardSummaryError(
      "No pudimos conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { message?: unknown };
    const message =
      typeof record.message === "string"
        ? record.message
        : "No fue posible cargar el panel. Inténtalo nuevamente.";
    throw new GetDashboardSummaryError(message);
  }

  return body as DashboardSummary;
}
