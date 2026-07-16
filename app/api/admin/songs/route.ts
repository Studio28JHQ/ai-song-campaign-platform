import { NextResponse } from "next/server";
import { ListSongsUseCase } from "@/application/admin/use-cases/ListSongsUseCase";
import { PrismaAdminSongListGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminSongListGate";
import { R2AudioUrlResolver } from "@/infrastructure/storage/R2AudioUrlResolver";
import { logger } from "@/shared/logger/logger";

/**
 * GET /api/admin/songs — the "Canciones" list (Sprint ADMIN-1 —
 * Backoffice de Campaña): status, provider, dates, and a signed
 * listen/download URL for each of the most recent songs. Read-only.
 * Access is already gated by `middleware.ts`.
 */

const listSongsUseCase = new ListSongsUseCase(
  new PrismaAdminSongListGate(),
  new R2AudioUrlResolver(),
);

export async function GET(): Promise<NextResponse> {
  try {
    const result = await listSongsUseCase.execute();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error("Unexpected error while listing songs", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "internal_error", message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
