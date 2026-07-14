import { NextResponse } from "next/server";
import { z } from "zod";
import { SearchLeadsUseCase } from "@/application/admin/use-cases/SearchLeadsUseCase";
import { PrismaAdminLeadSearchGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminLeadSearchGate";
import { ValidationError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/**
 * GET /api/admin/leads — searches participants by parent name, baby
 * name, email, or phone, with pagination and sorting (see
 * docs/Product/User_Flow.md — Search). Access is already gated by
 * `middleware.ts`. Read-only: no mutation is ever possible through this
 * endpoint.
 */

const searchLeadsUseCase = new SearchLeadsUseCase(new PrismaAdminLeadSearchGate());

const searchParamsSchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().optional(),
  pageSize: z.coerce.number().int().optional(),
  sortBy: z.enum(["createdAt", "parentName", "babyName", "email", "songStatus"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const parsed = searchParamsSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
    sortBy: searchParams.get("sortBy") ?? undefined,
    sortDirection: searchParams.get("sortDirection") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse(400, "invalid_request", "The search parameters are invalid.");
  }

  try {
    const result = await searchLeadsUseCase.execute({
      query: parsed.data.q,
      page: parsed.data.page ?? 1,
      pageSize: parsed.data.pageSize ?? 20,
      sortBy: parsed.data.sortBy,
      sortDirection: parsed.data.sortDirection,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errorResponse(400, "invalid_request", error.message);
    }

    logger.error("Unexpected error while searching leads", {
      error: error instanceof Error ? error.message : String(error),
    });

    return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
  }
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}
