import { NextResponse } from "next/server";
import { ListLyricsUseCase } from "@/application/admin/use-cases/ListLyricsUseCase";
import { PrismaAdminLyricsListGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminLyricsListGate";
import { logger } from "@/shared/logger/logger";

/**
 * GET /api/admin/lyrics — the "Letras" list (Sprint ADMIN-1 —
 * Backoffice de Campaña). Read-only. Access is already gated by
 * `middleware.ts`.
 */

const listLyricsUseCase = new ListLyricsUseCase(new PrismaAdminLyricsListGate());

export async function GET(): Promise<NextResponse> {
  try {
    const result = await listLyricsUseCase.execute();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error("Unexpected error while listing lyrics", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "internal_error", message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
