import type { AdminRecentActivityGate } from "../contracts/AdminRecentActivityGate";
import type { ListRecentActivityResponse } from "../dto/ListRecentActivityResponse";

export const DEFAULT_LIMIT = 15;

/**
 * Loads the latest campaign-wide events for the Dashboard's "Actividad
 * reciente" panel — a compact widget, not a paginated list page, so a
 * fixed limit (default 15) is enough; unlike the Auditoría screen,
 * this deliberately has no filters/pagination of its own.
 */
export class ListRecentActivityUseCase {
  constructor(private readonly activityGate: AdminRecentActivityGate) {}

  async execute(limit: number = DEFAULT_LIMIT): Promise<ListRecentActivityResponse> {
    const items = await this.activityGate.list(limit);
    return { items };
  }
}
