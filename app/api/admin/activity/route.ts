import { NextResponse } from "next/server";
import { ListRecentActivityUseCase } from "@/application/admin/use-cases/ListRecentActivityUseCase";
import { PrismaAdminRecentActivityGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminRecentActivityGate";
import { logger } from "@/shared/logger/logger";

/**
 * GET /api/admin/activity — the Dashboard's "Actividad reciente" panel
 * (Sprint FINAL-2 — Campaign Operations Dashboard). Read-only: the
 * latest events merged across leads, lyrics, songs, and resend audit
 * entries, newest first. Access is already gated by `middleware.ts`.
 */

const listRecentActivityUseCase = new ListRecentActivityUseCase(
  new PrismaAdminRecentActivityGate(),
);

export async function GET(): Promise<NextResponse> {
  try {
    const result = await listRecentActivityUseCase.execute();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error("Unexpected error while loading recent activity", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "internal_error", message: "Algo salió mal. Inténtalo de nuevo." },
      { status: 500 },
    );
  }
}
