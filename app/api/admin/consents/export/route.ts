import { NextResponse } from "next/server";
import type { AdminConsentRow } from "@/application/admin/contracts/AdminConsentGate";
import { ExportConsentsUseCase } from "@/application/admin/use-cases/ExportConsentsUseCase";
import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import { getAdminSession } from "@/infrastructure/auth/getAdminSession";
import { PrismaAdminConsentGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminConsentGate";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";
import { logger } from "@/shared/logger/logger";
import { toCsvLine } from "@/shared/utils/csv";

/**
 * GET /api/admin/consents/export — streams every Consent record in the
 * database as a CSV file (Feature 1 — Consent Management Screen),
 * unfiltered and unpaginated per this feature's requirements. Mirrors
 * `GET /api/admin/leads/export`: the response body is written as it's
 * produced, one batch at a time (`ExportConsentsUseCase` /
 * `PrismaAdminConsentGate`, keyset-paginated), so the full result set
 * is never held in memory.
 *
 * Every export writes an `export_consents` audit entry before the
 * stream starts — `ipAddress`/`userAgent` are PII, the same reasoning
 * `export_leads` already follows. A streamed response can't change its
 * HTTP status once the first byte has been sent, so the one thing that
 * *can* fail (no session) is checked before the stream starts; a
 * genuine mid-export database error is only logged and ends the stream
 * early.
 */

const exportConsentsUseCase = new ExportConsentsUseCase(new PrismaAdminConsentGate());
const auditLogRepository = new PrismaAuditLogRepository();

const CSV_HEADER = [
  "id",
  "sessionId",
  "leadId",
  "ipAddress",
  "userAgent",
  "policyVersion",
  "acceptedAt",
  "createdAt",
  "updatedAt",
  "leadParentName",
  "leadBabyName",
  "leadEmail",
];

function toCsvRow(row: AdminConsentRow): string {
  return toCsvLine([
    row.id,
    row.sessionId,
    row.leadId ?? "",
    row.ipAddress,
    row.userAgent,
    row.policyVersion,
    row.acceptedAt.toISOString(),
    row.createdAt.toISOString(),
    row.updatedAt.toISOString(),
    row.lead?.parentName ?? "",
    row.lead?.babyName ?? "",
    row.lead?.email ?? "",
  ]);
}

export async function GET(): Promise<Response> {
  const session = await getAdminSession();
  if (!session) {
    return errorResponse(401, "unauthorized", "Se requiere autenticación.");
  }

  await auditLogRepository.create(
    AuditLogEntry.create({
      adminId: session.adminId,
      action: "export_consents",
      entity: "Consent",
    }),
  );

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(toCsvLine(CSV_HEADER)));

      try {
        for await (const batch of exportConsentsUseCase.execute()) {
          for (const row of batch) {
            controller.enqueue(encoder.encode(toCsvRow(row)));
          }
        }
      } catch (error) {
        logger.error("Unexpected error while streaming the consents CSV export", {
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
      "Content-Disposition": `attachment; filename="consents-export.csv"`,
    },
  });
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
