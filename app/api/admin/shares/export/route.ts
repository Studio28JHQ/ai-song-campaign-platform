import { NextResponse } from "next/server";
import type { AdminShareExportRow } from "@/application/admin/contracts/AdminShareExportGate";
import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import { getAdminSession } from "@/infrastructure/auth/getAdminSession";
import { PrismaAdminShareExportGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminShareExportGate";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { logger } from "@/shared/logger/logger";
import { toCsvLine } from "@/shared/utils/csv";

/**
 * GET /api/admin/shares/export — every recorded share attempt as CSV.
 *
 * Same shape as the consents and leads exports: authenticate, write the
 * audit entry *before* the first byte (a streamed response cannot change
 * its status once it has started), then stream batches through
 * `toCsvLine`, which escapes CSV/formula injection — a lead-supplied
 * name beginning with `=`, `+`, `-` or `@` opens as text, never a
 * formula.
 *
 * Dates are rendered in the campaign's timezone, not UTC, so the export
 * agrees with every other date on the admin screens.
 */

const shareExportGate = new PrismaAdminShareExportGate();
const auditLogRepository = new PrismaAuditLogRepository();

/** Matches the consents export; small enough to stream, large enough to be few round trips. */
const SHARE_EXPORT_BATCH_SIZE = 500;

const CAMPAIGN_TIME_ZONE = "America/Guayaquil";

const CSV_HEADER = [
  "Fecha",
  "Hora",
  "Familia",
  "Bebé",
  "Email",
  "Plataforma",
  "utm_source",
  "utm_medium",
  "utm_campaign",
];

const PLATFORM_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  FACEBOOK: "Facebook",
  X: "X",
};

/** `YYYY-MM-DD` and `HH:mm:ss` in the campaign's timezone, split into two columns. */
function formatCampaignDateTime(value: Date): { date: string; time: string } {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: CAMPAIGN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: CAMPAIGN_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(value);

  return { date, time };
}

function toCsvRow(row: AdminShareExportRow): string {
  const { date, time } = formatCampaignDateTime(row.createdAt);

  return toCsvLine([
    date,
    time,
    row.parentName,
    row.babyName,
    row.email,
    PLATFORM_LABELS[row.platform] ?? row.platform,
    row.utmSource ?? "",
    row.utmMedium ?? "",
    row.utmCampaign ?? "",
  ]);
}

export async function GET(): Promise<Response> {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json(
      { error: "unauthorized", message: "Se requiere autenticación." },
      { status: 401 },
    );
  }

  await auditLogRepository.create(
    AuditLogEntry.create({
      adminId: session.adminId,
      action: "export_shares",
      entity: "ShareEvent",
    }),
  );

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(toCsvLine(CSV_HEADER)));

      try {
        for await (const batch of shareExportGate.streamAll(SHARE_EXPORT_BATCH_SIZE)) {
          for (const row of batch) {
            controller.enqueue(encoder.encode(toCsvRow(row)));
          }
        }
      } catch (error) {
        logger.error("Unexpected error while streaming the shares CSV export", {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shares-export.csv"`,
    },
  });
}
