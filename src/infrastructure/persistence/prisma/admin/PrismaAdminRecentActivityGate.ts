import type { PrismaClient } from "@/generated/prisma/client";
import type {
  AdminRecentActivityGate,
  RecentActivityRow,
} from "@/application/admin/contracts/AdminRecentActivityGate";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

const LEAD_NAME_SELECT = { parentName: true, babyName: true } as const;

/**
 * Thin Prisma adapter satisfying the `AdminRecentActivityGate` port.
 * Six bounded queries (`take: limit` each, run in parallel) against
 * existing tables, merged and re-sorted in memory — no per-row query,
 * so this stays O(1) round trips regardless of how many events exist.
 * The one exception is `resend_email` audit entries, whose `entityId`
 * is a Song id (see `GetLeadDetailUseCase`), resolved via a single
 * bounded follow-up `song.findMany({ id: { in: [...] } })` — still not
 * N+1, just a second batch query.
 */
export class PrismaAdminRecentActivityGate implements AdminRecentActivityGate {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async list(limit: number): Promise<RecentActivityRow[]> {
    try {
      const [
        leadsRegistered,
        lyricsGenerated,
        lyricsApproved,
        songsCompleted,
        emailsSent,
        resends,
      ] = await Promise.all([
        this.client.lead.findMany({
          orderBy: { createdAt: "desc" },
          take: limit,
          select: { id: true, createdAt: true, ...LEAD_NAME_SELECT },
        }),
        this.client.lyrics.findMany({
          orderBy: { createdAt: "desc" },
          take: limit,
          select: {
            leadId: true,
            createdAt: true,
            lead: { select: LEAD_NAME_SELECT },
          },
        }),
        this.client.lyrics.findMany({
          where: { approved: true },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: {
            leadId: true,
            createdAt: true,
            lead: { select: LEAD_NAME_SELECT },
          },
        }),
        this.client.song.findMany({
          where: { completedAt: { not: null } },
          orderBy: { completedAt: "desc" },
          take: limit,
          select: {
            leadId: true,
            completedAt: true,
            lead: { select: LEAD_NAME_SELECT },
          },
        }),
        this.client.song.findMany({
          where: { emailedAt: { not: null } },
          orderBy: { emailedAt: "desc" },
          take: limit,
          select: {
            leadId: true,
            emailedAt: true,
            lead: { select: LEAD_NAME_SELECT },
          },
        }),
        this.client.auditLog.findMany({
          where: { action: "resend_email" },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: { entityId: true, createdAt: true },
        }),
      ]);

      const resendSongIds = [
        ...new Set(
          resends.map((entry) => entry.entityId).filter((id): id is string => id !== null),
        ),
      ];
      const resendSongs =
        resendSongIds.length > 0
          ? await this.client.song.findMany({
              where: { id: { in: resendSongIds } },
              select: { id: true, leadId: true, lead: { select: LEAD_NAME_SELECT } },
            })
          : [];
      const resendSongById = new Map(resendSongs.map((song) => [song.id, song]));

      const rows: RecentActivityRow[] = [
        ...leadsRegistered.map((lead) => ({
          type: "lead_registered" as const,
          timestamp: lead.createdAt,
          leadId: lead.id,
          parentName: lead.parentName,
          babyName: lead.babyName,
        })),
        ...lyricsGenerated.map((entry) => ({
          type: "lyrics_generated" as const,
          timestamp: entry.createdAt,
          leadId: entry.leadId,
          parentName: entry.lead.parentName,
          babyName: entry.lead.babyName,
        })),
        ...lyricsApproved.map((entry) => ({
          type: "lyrics_approved" as const,
          timestamp: entry.createdAt,
          leadId: entry.leadId,
          parentName: entry.lead.parentName,
          babyName: entry.lead.babyName,
        })),
        ...songsCompleted.map((song) => ({
          type: "song_completed" as const,
          timestamp: song.completedAt!,
          leadId: song.leadId,
          parentName: song.lead.parentName,
          babyName: song.lead.babyName,
        })),
        ...emailsSent.map((song) => ({
          type: "email_sent" as const,
          timestamp: song.emailedAt!,
          leadId: song.leadId,
          parentName: song.lead.parentName,
          babyName: song.lead.babyName,
        })),
        ...resends.flatMap((entry) => {
          const song = entry.entityId ? resendSongById.get(entry.entityId) : undefined;
          if (!song) return [];
          return [
            {
              type: "email_resent" as const,
              timestamp: entry.createdAt,
              leadId: song.leadId,
              parentName: song.lead.parentName,
              babyName: song.lead.babyName,
            },
          ];
        }),
      ];

      return rows.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit);
    } catch (error) {
      throw new DatabaseError("Unexpected database error while loading recent activity.", {
        code: "admin.unexpected_database_error",
        cause: error,
        context: { operation: "list" },
      });
    }
  }
}
