import { NextResponse } from "next/server";
import { GetDashboardSummaryUseCase } from "@/application/admin/use-cases/GetDashboardSummaryUseCase";
import { appConfig } from "@/config/app";
import { PrismaAdminDashboardGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminDashboardGate";
import { logger } from "@/shared/logger/logger";

/**
 * GET /api/admin/dashboard — the Dashboard's summary cards, campaign
 * goal progress, generation-time stats, and funnel counts (Sprint
 * ADMIN-1 — Backoffice de Campaña). No charts, no analytics. Access is
 * already gated by `middleware.ts`.
 */

const getDashboardSummaryUseCase = new GetDashboardSummaryUseCase(
  new PrismaAdminDashboardGate(),
  appConfig.campaign.maxSongs,
);

export async function GET(): Promise<NextResponse> {
  try {
    const summary = await getDashboardSummaryUseCase.execute();
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    // Sprint FINAL-3 — Dashboard Stabilization: `PrismaAdminDashboardGate`
    // now isolates every individual query, so reaching this branch means
    // something failed outside any single widget's fallback (e.g. the use
    // case itself). Log the full cause chain — logging only `.message`
    // previously discarded the real underlying error, effectively
    // suppressing it even from server logs.
    logger.error("Unexpected error while loading the admin dashboard summary", {
      error: error instanceof Error ? error.message : String(error),
      cause:
        error instanceof Error && error.cause instanceof Error
          ? error.cause.message
          : error instanceof Error
            ? error.cause
            : undefined,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        error: "internal_error",
        message: "No fue posible cargar el panel. Inténtalo nuevamente.",
      },
      { status: 500 },
    );
  }
}
