import type { RecentActivityEventType } from "../contracts/AdminRecentActivityGate";

/** One row for the "Actividad reciente" panel. Spanish labeling is a presentation concern (see `RecentActivityPanel`), not part of this DTO. */
export interface RecentActivityView {
  type: RecentActivityEventType;
  timestamp: Date;
  leadId: string;
  parentName: string;
  babyName: string;
}

export interface ListRecentActivityResponse {
  items: RecentActivityView[];
}
