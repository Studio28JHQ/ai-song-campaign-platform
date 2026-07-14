import type { PrismaClient } from "@/generated/prisma/client";
import type {
  AdminLeadExportGate,
  AdminLeadExportRow,
} from "@/application/admin/contracts/AdminLeadExportGate";
import type { AdminLeadFilterCriteria } from "@/application/admin/contracts/AdminLeadFilterCriteria";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";
import { buildAdminLeadWhere, toPublicSongStatus } from "./adminLeadFilters";

/**
 * Thin Prisma adapter satisfying the `AdminLeadExportGate` port: the same
 * filtered join `PrismaAdminLeadSearchGate` uses (sharing its `WHERE`
 * construction via `adminLeadFilters.ts`), but paged internally in fixed
 * `batchSize` chunks via a plain `skip`/`take` loop ordered by
 * `(createdAt, id)` for a stable cursor — never a single unbounded
 * `findMany()` — so the full result set is never held in memory at once
 * (see docs/Product/User_Flow.md — Performance).
 */
export class PrismaAdminLeadExportGate implements AdminLeadExportGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async *streamRows(
    filter: AdminLeadFilterCriteria,
    batchSize: number,
  ): AsyncGenerator<AdminLeadExportRow[]> {
    const where = buildAdminLeadWhere(filter);
    let skip = 0;

    for (;;) {
      let records;

      try {
        records = await this.client.lead.findMany({
          where,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          skip,
          take: batchSize,
          include: {
            lyrics: { select: { approved: true } },
            song: { select: { status: true, generatedAt: true, emailedAt: true } },
          },
        });
      } catch (error) {
        throw new DatabaseError("Unexpected database error while exporting leads.", {
          code: "admin.unexpected_database_error",
          cause: error,
          context: { operation: "streamRows", skip },
        });
      }

      if (records.length === 0) return;

      yield records.map((record) => ({
        parentName: record.parentName,
        babyName: record.babyName,
        email: record.email,
        phone: record.phone,
        createdAt: record.createdAt,
        lyricsStatus: this.toLyricsStatus(record.lyrics),
        songStatus: record.song ? toPublicSongStatus(record.song.status) : null,
        emailStatus: record.song?.emailedAt != null ? ("SENT" as const) : ("NOT_SENT" as const),
        generatedAt: record.song?.generatedAt ?? null,
        emailedAt: record.song?.emailedAt ?? null,
      }));

      if (records.length < batchSize) return;
      skip += batchSize;
    }
  }

  private toLyricsStatus(lyrics: Array<{ approved: boolean }>): "NONE" | "GENERATED" | "APPROVED" {
    if (lyrics.length === 0) return "NONE";
    return lyrics.some((entry) => entry.approved) ? "APPROVED" : "GENERATED";
  }
}
