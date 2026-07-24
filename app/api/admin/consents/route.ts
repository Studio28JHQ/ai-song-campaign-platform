import { NextResponse } from "next/server";
import { ListConsentsUseCase } from "@/application/admin/use-cases/ListConsentsUseCase";
import { PrismaAdminConsentGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminConsentGate";
import { logger } from "@/shared/logger/logger";

/**
 * GET /api/admin/consents — the "Consentimientos" list: the latest 20
 * Consent records (Feature 1 — Consent Management Screen), newest
 * first. Read-only, no pagination/search (not requested for this
 * screen — see `GET /api/admin/consents/export` for the full,
 * unfiltered table). Access is already gated by `middleware.ts`.
 */

const listConsentsUseCase = new ListConsentsUseCase(new PrismaAdminConsentGate());

export async function GET(): Promise<NextResponse> {
  try {
    const result = await listConsentsUseCase.execute();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error("Unexpected error while listing consents", {
      error: error instanceof Error ? error.message : String(error),
      cause:
        error instanceof Error && error.cause instanceof Error
          ? error.cause.message
          : error instanceof Error
            ? error.cause
            : undefined,
    });

    return NextResponse.json(
      { error: "internal_error", message: "Algo salió mal. Inténtalo de nuevo." },
      { status: 500 },
    );
  }
}
