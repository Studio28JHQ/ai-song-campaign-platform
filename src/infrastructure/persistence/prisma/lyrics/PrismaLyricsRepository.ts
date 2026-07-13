import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Lyrics } from "@/domain/lyrics/entities/Lyrics";
import type { LyricsRepository } from "@/domain/lyrics/repositories/LyricsRepository";
import { BusinessRuleError, DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";
import { LyricsMapper } from "./LyricsMapper";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

/**
 * Prisma implementation of `LyricsRepository`. No Prisma type or exception
 * ever escapes this class — callers only ever see domain entities and the
 * shared error taxonomy (`@/shared/errors`).
 */
export class PrismaLyricsRepository implements LyricsRepository {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async create(lyrics: Lyrics): Promise<Lyrics> {
    try {
      const record = await this.client.lyrics.create({ data: LyricsMapper.toCreateInput(lyrics) });
      return LyricsMapper.toDomain(record);
    } catch (error) {
      this.handleError(error, { operation: "create", leadId: lyrics.leadId });
    }
  }

  async findById(id: string): Promise<Lyrics | null> {
    try {
      const record = await this.client.lyrics.findUnique({ where: { id } });
      return record ? LyricsMapper.toDomain(record) : null;
    } catch (error) {
      this.handleError(error, { operation: "findById", id });
    }
  }

  async findAllByLead(leadId: string): Promise<Lyrics[]> {
    try {
      const records = await this.client.lyrics.findMany({
        where: { leadId },
        orderBy: { version: "asc" },
      });
      return records.map(LyricsMapper.toDomain);
    } catch (error) {
      this.handleError(error, { operation: "findAllByLead", leadId });
    }
  }

  async findApprovedByLead(leadId: string): Promise<Lyrics | null> {
    try {
      const record = await this.client.lyrics.findFirst({ where: { leadId, approved: true } });
      return record ? LyricsMapper.toDomain(record) : null;
    } catch (error) {
      this.handleError(error, { operation: "findApprovedByLead", leadId });
    }
  }

  async approve(lyrics: Lyrics): Promise<Lyrics> {
    try {
      const record = await this.client.lyrics.update({
        where: { id: lyrics.id },
        data: LyricsMapper.toUpdateInput(lyrics),
      });
      return LyricsMapper.toDomain(record);
    } catch (error) {
      this.handleApprovalError(error, { operation: "approve", lyricsId: lyrics.id });
    }
  }

  async reject(lyrics: Lyrics): Promise<Lyrics> {
    try {
      const record = await this.client.lyrics.update({
        where: { id: lyrics.id },
        data: LyricsMapper.toUpdateInput(lyrics),
      });
      return LyricsMapper.toDomain(record);
    } catch (error) {
      this.handleError(error, { operation: "reject", lyricsId: lyrics.id });
    }
  }

  /** Approving has a business meaning for a unique-constraint violation: a race with another approval for the same lead. */
  private handleApprovalError(error: unknown, context: Record<string, unknown>): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_CONSTRAINT_VIOLATION
    ) {
      throw new BusinessRuleError("This lead already has an approved lyrics version.", {
        code: "lyrics.lead_already_has_approved_version",
        cause: error,
        context,
      });
    }

    this.handleError(error, context);
  }

  private handleError(error: unknown, context: Record<string, unknown>): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new DatabaseError(`Database request failed (${error.code}).`, {
        code: "lyrics.database_request_failed",
        cause: error,
        context: { ...context, prismaCode: error.code },
      });
    }

    throw new DatabaseError("Unexpected database error while accessing Lyrics data.", {
      code: "lyrics.unexpected_database_error",
      cause: error,
      context,
    });
  }
}
