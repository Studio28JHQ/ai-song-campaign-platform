import type { PrismaClient } from "@/generated/prisma/client";
import type {
  AdminConsentGate,
  AdminConsentRow,
} from "@/application/admin/contracts/AdminConsentGate";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

/** Fields this read model actually maps — an explicit `select`, not `include`, so it's never coupled to Consent/Lead columns it doesn't use (same reasoning as `PrismaAdminLyricsListGate`). */
const CONSENT_SELECT = {
  id: true,
  sessionId: true,
  leadId: true,
  ipAddress: true,
  userAgent: true,
  policyVersion: true,
  acceptedAt: true,
  createdAt: true,
  updatedAt: true,
  lead: { select: { parentName: true, babyName: true, email: true } },
} as const;

/**
 * Thin Prisma adapter satisfying the `AdminConsentGate` port — the admin
 * "Consentimientos" screen's latest-20 read and full-table CSV export,
 * both over the existing `Consent`/`Lead` relationship, no new
 * persistence.
 */
export class PrismaAdminConsentGate implements AdminConsentGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async listLatest(limit: number): Promise<AdminConsentRow[]> {
    try {
      const records = await this.client.consent.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: CONSENT_SELECT,
      });

      return records.map((record) => this.toRow(record));
    } catch (error) {
      throw new DatabaseError("Unexpected database error while listing consents.", {
        code: "admin.unexpected_database_error",
        cause: error,
        context: { operation: "listLatest", limit },
      });
    }
  }

  /**
   * Keyset (cursor) pagination rather than `skip`/`take` — unlike the
   * Leads export (bounded by the campaign's ≤3,000-lead cap), Consent
   * rows accumulate from every Landing visit, not just registrations,
   * so this keeps each batch query's cost independent of how deep into
   * the export it is (see "efficient for future growth" in this
   * feature's requirements), instead of Postgres re-scanning and
   * discarding an ever-growing `OFFSET`.
   */
  async *streamAll(batchSize: number): AsyncGenerator<AdminConsentRow[]> {
    let cursorId: string | undefined;

    for (;;) {
      let records;

      try {
        records = await this.client.consent.findMany({
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: batchSize,
          ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
          select: CONSENT_SELECT,
        });
      } catch (error) {
        throw new DatabaseError("Unexpected database error while exporting consents.", {
          code: "admin.unexpected_database_error",
          cause: error,
          context: { operation: "streamAll" },
        });
      }

      if (records.length === 0) return;

      yield records.map((record) => this.toRow(record));

      if (records.length < batchSize) return;

      cursorId = records[records.length - 1].id;
    }
  }

  private toRow(record: {
    id: string;
    sessionId: string;
    leadId: string | null;
    ipAddress: string;
    userAgent: string;
    policyVersion: string;
    acceptedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    lead: { parentName: string; babyName: string; email: string } | null;
  }): AdminConsentRow {
    return {
      id: record.id,
      sessionId: record.sessionId,
      leadId: record.leadId,
      ipAddress: record.ipAddress,
      userAgent: record.userAgent,
      policyVersion: record.policyVersion,
      acceptedAt: record.acceptedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      lead: record.lead,
    };
  }
}
