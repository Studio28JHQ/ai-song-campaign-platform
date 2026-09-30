import type {
  AdminShareEventGate,
  AdminShareEventView,
} from "@/application/admin/contracts/AdminShareEventGate";
import type { PrismaClient } from "@/generated/prisma/client";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

/**
 * Share Tracking — a lead's share events, newest first.
 *
 * Served by the `(leadId, createdAt)` index, so this is an index range
 * scan rather than a filter over the table, and it reads two columns.
 * One query per lead-detail load, inside that screen's existing
 * `Promise.all` — never one per row anywhere.
 */
export class PrismaAdminShareEventGate implements AdminShareEventGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async findByLead(leadId: string): Promise<AdminShareEventView[]> {
    try {
      return await this.client.shareEvent.findMany({
        where: { leadId },
        orderBy: { createdAt: "desc" },
        select: { platform: true, createdAt: true },
      });
    } catch (cause) {
      throw new DatabaseError("Failed to read the lead's share events.", {
        code: "admin.share_events_read_failed",
        cause,
        context: { leadId },
      });
    }
  }
}
