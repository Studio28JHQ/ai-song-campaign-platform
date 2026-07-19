import { NextResponse } from "next/server";
import { z } from "zod";
import type { AdminLeadExportRow } from "@/application/admin/contracts/AdminLeadExportGate";
import { validateDateRange } from "@/application/admin/validateDateRange";
import { ExportLeadsUseCase } from "@/application/admin/use-cases/ExportLeadsUseCase";
import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import { getAdminSession } from "@/infrastructure/auth/getAdminSession";
import { PrismaAdminLeadExportGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminLeadExportGate";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { ValidationError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/**
 * GET /api/admin/leads/export — streams the same filtered/searched
 * participant set the Dashboard table shows as a CSV file (see
 * docs/Product/User_Flow.md — Export). The response body is written as
 * it's produced, one batch at a time (`ExportLeadsUseCase` /
 * `PrismaAdminLeadExportGate`), so the full result set is never held in
 * memory — see docs/Product/User_Flow.md — Performance.
 *
 * A streamed response can't change its HTTP status once the first byte
 * has been sent, so every validation that *can* fail (bad filters, no
 * session) happens before the stream starts; only a genuine mid-export
 * database error is limited to being logged and ending the stream early.
 *
 * Sprint FINAL-1 — Production Hardening: every export writes an
 * `export_leads` audit entry (who exported which filter combination,
 * and when) before the stream starts — PII (email/phone) leaves the
 * system on every export, so this is exactly the kind of action the
 * audit trail exists for. Cell values are also escaped against
 * CSV/formula injection: a lead-supplied field starting with
 * `=`, `+`, `-`, or `@` is prefixed with `'` so it opens as text, never
 * a formula, in Excel/Sheets.
 */

const exportLeadsUseCase = new ExportLeadsUseCase(new PrismaAdminLeadExportGate());
const auditLogRepository = new PrismaAuditLogRepository();

/** Characters that, left unescaped, let a lead's own text field open as a formula when the exported CSV is opened in Excel/Sheets (CSV/formula injection). */
const FORMULA_TRIGGER_CHARS = new Set(["=", "+", "-", "@"]);

const CSV_HEADER = [
  "Lead",
  "Baby",
  "Email",
  "Phone",
  "Baby Age",
  "City",
  "Created Date",
  "Lyrics Status",
  "Song Status",
  "Email Status",
  "Generation Date",
  "Delivery Date",
];

const exportParamsSchema = z.object({
  q: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  songStatus: z.enum(["QUEUED", "GENERATING", "COMPLETED", "FAILED", "NONE"]).optional(),
  emailStatus: z.enum(["SENT", "NOT_SENT"]).optional(),
  city: z.string().optional(),
});

function csvEscape(value: string): string {
  const safe = FORMULA_TRIGGER_CHARS.has(value[0]) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCsvLine(cells: string[]): string {
  return cells.map(csvEscape).join(",") + "\n";
}

function toCsvRow(row: AdminLeadExportRow): string {
  return toCsvLine([
    row.parentName,
    row.babyName,
    row.email,
    row.phone ?? "",
    row.babyAge != null ? String(row.babyAge) : "",
    row.city ?? "",
    row.createdAt.toISOString(),
    row.lyricsStatus,
    row.songStatus ?? "",
    row.emailStatus,
    row.generatedAt ? row.generatedAt.toISOString() : "",
    row.emailedAt ? row.emailedAt.toISOString() : "",
  ]);
}

export async function GET(request: Request): Promise<Response> {
  const session = await getAdminSession();
  if (!session) {
    return errorResponse(401, "unauthorized", "Se requiere autenticación.");
  }

  const { searchParams } = new URL(request.url);

  const parsed = exportParamsSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    songStatus: searchParams.get("songStatus") ?? undefined,
    emailStatus: searchParams.get("emailStatus") ?? undefined,
    city: searchParams.get("city") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse(400, "invalid_request", "The export parameters are invalid.");
  }

  try {
    validateDateRange(parsed.data.dateFrom, parsed.data.dateTo);
  } catch (error) {
    if (error instanceof ValidationError) {
      return errorResponse(400, "invalid_request", error.message);
    }
    throw error;
  }

  const filter = {
    query: parsed.data.q,
    dateFrom: parsed.data.dateFrom,
    dateTo: parsed.data.dateTo,
    songStatus: parsed.data.songStatus,
    emailStatus: parsed.data.emailStatus,
    city: parsed.data.city,
  };

  await auditLogRepository.create(
    AuditLogEntry.create({
      adminId: session.adminId,
      action: "export_leads",
      entity: "Lead",
      metadata: {
        query: filter.query ?? null,
        dateFrom: filter.dateFrom ? filter.dateFrom.toISOString() : null,
        dateTo: filter.dateTo ? filter.dateTo.toISOString() : null,
        songStatus: filter.songStatus ?? null,
        emailStatus: filter.emailStatus ?? null,
        city: filter.city ?? null,
      },
    }),
  );

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(toCsvLine(CSV_HEADER)));

      try {
        for await (const batch of exportLeadsUseCase.execute(filter)) {
          for (const row of batch) {
            controller.enqueue(encoder.encode(toCsvRow(row)));
          }
        }
      } catch (error) {
        logger.error("Unexpected error while streaming the leads CSV export", {
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
      "Content-Disposition": `attachment; filename="leads-export.csv"`,
    },
  });
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
