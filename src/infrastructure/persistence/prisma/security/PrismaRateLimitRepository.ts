import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { RateLimitRepository } from "@/domain/security/repositories/RateLimitRepository";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

/**
 * Prisma implementation of `RateLimitRepository`, backed by the
 * `rate_limit_events` table — a plain event log counted within a sliding
 * window (see PROJECT_MANIFEST.md — no Redis/message queue). No Prisma
 * type or exception ever escapes this class.
 */
export class PrismaRateLimitRepository implements RateLimitRepository {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async countRecentEvents(key: string, windowStart: Date): Promise<number> {
    try {
      return await this.client.rateLimitEvent.count({
        where: { key, createdAt: { gte: windowStart } },
      });
    } catch (error) {
      this.handleError(error, { operation: "countRecentEvents", key });
    }
  }

  async recordEvent(key: string): Promise<void> {
    try {
      await this.client.rateLimitEvent.create({ data: { key } });
    } catch (error) {
      this.handleError(error, { operation: "recordEvent", key });
    }
  }

  private handleError(error: unknown, context: Record<string, unknown>): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new DatabaseError(`Database request failed (${error.code}).`, {
        code: "security.database_request_failed",
        cause: error,
        context: { ...context, prismaCode: error.code },
      });
    }

    throw new DatabaseError("Unexpected database error while accessing RateLimitEvent data.", {
      code: "security.unexpected_database_error",
      cause: error,
      context,
    });
  }
}
