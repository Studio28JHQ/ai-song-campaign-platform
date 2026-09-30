import type {
  AdminShareExportGate,
  AdminShareExportRow,
} from "@/application/admin/contracts/AdminShareExportGate";
import type { PrismaClient } from "@/generated/prisma/client";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

const SHARE_EXPORT_SELECT = {
  id: true,
  createdAt: true,
  platform: true,
  utmSource: true,
  utmMedium: true,
  utmCampaign: true,
  lead: { select: { parentName: true, babyName: true, email: true } },
} as const;

/**
 * Share Tracking — streams every share event for the CSV export.
 *
 * Keyset pagination on `(createdAt, id)`, identical in shape to
 * `PrismaAdminConsentGate.streamAll`: batches keep the whole table out of
 * memory, and the cursor avoids the growing `OFFSET` scan that makes a
 * long export progressively slower.
 */
export class PrismaAdminShareExportGate implements AdminShareExportGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async *streamAll(batchSize: number): AsyncGenerator<AdminShareExportRow[]> {
    let cursorId: string | undefined;

    for (;;) {
      let records;

      try {
        records = await this.client.shareEvent.findMany({
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: batchSize,
          ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
          select: SHARE_EXPORT_SELECT,
        });
      } catch (error) {
        throw new DatabaseError("Unexpected database error while exporting share events.", {
          code: "admin.unexpected_database_error",
          cause: error,
          context: { operation: "streamAll" },
        });
      }

      if (records.length === 0) return;

      yield records.map((record) => ({
        id: record.id,
        createdAt: record.createdAt,
        platform: record.platform,
        utmSource: record.utmSource,
        utmMedium: record.utmMedium,
        utmCampaign: record.utmCampaign,
        parentName: record.lead.parentName,
        babyName: record.lead.babyName,
        email: record.lead.email,
      }));

      if (records.length < batchSize) return;

      cursorId = records[records.length - 1].id;
    }
  }
}
