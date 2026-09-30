import type { SharePlatform } from "@/generated/prisma/client";

/**
 * Share Tracking — the write side of share events, and nothing else.
 *
 * A port rather than a repository for the same reason `CampaignGate` and
 * `EmailDeliveryTracker` are: there is no aggregate here and nothing is
 * ever read back through it. One method, one insert.
 *
 * Implementations may throw. Callers must treat this as best-effort and
 * must never let a failure here change what the person gets — losing a
 * metric is acceptable, breaking a family's share button is not (see
 * the tracking route).
 */
export interface ShareEventRecord {
  songId: string;
  leadId: string;
  platform: SharePlatform;
  /** Derived server-side from the validated platform; stored as data only. */
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

export interface ShareEventRecorder {
  record(event: ShareEventRecord): Promise<void>;
}
