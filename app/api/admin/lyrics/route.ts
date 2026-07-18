import { NextResponse } from "next/server";
import { z } from "zod";
import { ListLyricsUseCase } from "@/application/admin/use-cases/ListLyricsUseCase";
import { PrismaAdminLyricsListGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminLyricsListGate";
import { ValidationError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/**
 * GET /api/admin/lyrics — the "Letras" list (Sprint ADMIN-1 —
 * Backoffice de Campaña; paginated/searchable as of Sprint FINAL-1 —
 * Production Hardening). Read-only. Access is already gated by
 * `middleware.ts`.
 */

const listLyricsUseCase = new ListLyricsUseCase(new PrismaAdminLyricsListGate());

const searchParamsSchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().optional(),
  pageSize: z.coerce.number().int().optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const parsed = searchParamsSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse(400, "invalid_request", "The search parameters are invalid.");
  }

  try {
    const result = await listLyricsUseCase.execute({
      query: parsed.data.q,
      page: parsed.data.page ?? 1,
      pageSize: parsed.data.pageSize ?? 20,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errorResponse(400, "invalid_request", error.message);
    }

    // `error.message` alone is the gate's own generic wrapper text — the
    // real underlying database error is only ever visible via `.cause`
    // (see `PrismaAdminLyricsListGate`). Logging only the former made an
    // actual root cause invisible even server-side. The response to the
    // client is unchanged either way.
    logger.error("Unexpected error while listing lyrics", {
      error: error instanceof Error ? error.message : String(error),
      cause:
        error instanceof Error && error.cause instanceof Error
          ? error.cause.message
          : error instanceof Error
            ? error.cause
            : undefined,
    });

    return errorResponse(500, "internal_error", "Algo salió mal. Inténtalo de nuevo.");
  }
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
