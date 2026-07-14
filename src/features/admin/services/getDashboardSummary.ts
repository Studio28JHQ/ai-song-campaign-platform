export interface DashboardSummary {
  totalLeads: number;
  songsCompleted: number;
  songsPending: number;
  songsFailed: number;
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
      "We couldn't reach the server. Please check your connection and try again.",
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Something went wrong.";
    throw new GetDashboardSummaryError(message);
  }

  return body as DashboardSummary;
}
