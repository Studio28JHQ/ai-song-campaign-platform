import type { SharePlatform } from "@/generated/prisma/client";

/**
 * Share Tracking — one row of the shares CSV export.
 *
 * Carries the family's own details because that is what makes an export
 * useful to the campaign team, and because the same PII already leaves
 * the system through the leads export. Every export is audited for
 * exactly that reason.
 */
export interface AdminShareExportRow {
  id: string;
  createdAt: Date;
  platform: SharePlatform;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  parentName: string;
  babyName: string;
  email: string;
}

export interface AdminShareExportGate {
  /**
   * Every share event, oldest first, in keyset-paginated batches — the
   * same cursor walk `AdminConsentGate.streamAll` uses, so the full
   * table is never held in memory and one long export never holds a
   * connection open reading everything at once.
   */
  streamAll(batchSize: number): AsyncGenerator<AdminShareExportRow[]>;
}
