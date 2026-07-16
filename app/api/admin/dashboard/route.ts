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
    logger.error("Unexpected error while loading the admin dashboard summary", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "internal_error", message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
