import { NextResponse } from "next/server";
import { z } from "zod";
import { ListSongsUseCase } from "@/application/admin/use-cases/ListSongsUseCase";
import { PrismaAdminSongListGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminSongListGate";
import { R2AudioUrlResolver } from "@/infrastructure/storage/R2AudioUrlResolver";
import { ValidationError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/**
 * GET /api/admin/songs — the "Canciones" list (Sprint ADMIN-1 —
 * Backoffice de Campaña; paginated/searchable/filterable as of Sprint
 * FINAL-1 — Production Hardening): status, provider, dates, the
 * provider's failure reason, and a signed listen/download URL for each
 * song. Read-only. Access is already gated by `middleware.ts`.
 */

const listSongsUseCase = new ListSongsUseCase(
  new PrismaAdminSongListGate(),
  new R2AudioUrlResolver(),
);

const searchParamsSchema = z.object({
  q: z.string().optional(),
  status: z.enum(["QUEUED", "GENERATING", "COMPLETED", "FAILED"]).optional(),
  page: z.coerce.number().int().optional(),
  pageSize: z.coerce.number().int().optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const parsed = searchParamsSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse(400, "invalid_request", "The search parameters are invalid.");
  }

  try {
    const result = await listSongsUseCase.execute({
      query: parsed.data.q,
      status: parsed.data.status,
      page: parsed.data.page ?? 1,
      pageSize: parsed.data.pageSize ?? 20,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errorResponse(400, "invalid_request", error.message);
    }

    logger.error("Unexpected error while listing songs", {
      error: error instanceof Error ? error.message : String(error),
    });

    return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
  }
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
