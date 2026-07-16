import { NextResponse } from "next/server";
import { ListAuditLogUseCase } from "@/application/admin/use-cases/ListAuditLogUseCase";
import { getAdminSession } from "@/infrastructure/auth/getAdminSession";
import { PrismaAdminUserRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAdminUserRepository";
import { PrismaAuditLogRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository";

/**
 * GET /api/admin/audit — the "Auditoría" screen (Sprint ADMIN-1 —
 * Backoffice de Campaña). Read-only: the most recent audit entries,
 * newest first. Access is already gated by `middleware.ts`.
 */

const listAuditLogUseCase = new ListAuditLogUseCase(
  new PrismaAuditLogRepository(),
  new PrismaAdminUserRepository(),
);

export async function GET(): Promise<NextResponse> {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json(
      { error: "unauthorized", message: "Authentication required." },
      { status: 401 },
    );
  }

  const result = await listAuditLogUseCase.execute();
  return NextResponse.json(result, { status: 200 });
}
