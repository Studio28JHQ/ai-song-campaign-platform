import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Song } from "@/domain/song/entities/Song";
import type { SongRepository } from "@/domain/song/repositories/SongRepository";
import { BusinessRuleError, DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";
import { SongMapper } from "./SongMapper";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

/**
 * Prisma implementation of `SongRepository`. No Prisma type or exception
 * ever escapes this class — callers only ever see domain entities and the
 * shared error taxonomy (`@/shared/errors`).
 */
export class PrismaSongRepository implements SongRepository {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async create(song: Song): Promise<Song> {
    try {
      const record = await this.client.song.create({ data: SongMapper.toCreateInput(song) });
      return SongMapper.toDomain(record);
    } catch (error) {
      this.handleCreateError(error, { operation: "create", leadId: song.leadId });
    }
  }

  async findById(id: string): Promise<Song | null> {
    try {
      const record = await this.client.song.findUnique({ where: { id } });
      return record ? SongMapper.toDomain(record) : null;
    } catch (error) {
      this.handleError(error, { operation: "findById", id });
    }
  }

  async findByLead(leadId: string): Promise<Song | null> {
    try {
      const record = await this.client.song.findUnique({ where: { leadId } });
      return record ? SongMapper.toDomain(record) : null;
    } catch (error) {
      this.handleError(error, { operation: "findByLead", leadId });
    }
  }

  async update(song: Song): Promise<Song> {
    try {
      const record = await this.client.song.update({
        where: { id: song.id },
        data: SongMapper.toUpdateInput(song),
      });
      return SongMapper.toDomain(record);
    } catch (error) {
      this.handleError(error, { operation: "update", songId: song.id });
    }
  }

  /** A unique-constraint violation on create has a specific business meaning: this lead already has a song row. */
  private handleCreateError(error: unknown, context: Record<string, unknown>): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_CONSTRAINT_VIOLATION
    ) {
      throw new BusinessRuleError("This lead has already generated a song.", {
        code: "song.already_exists",
        cause: error,
        context,
      });
    }

    this.handleError(error, context);
  }

  private handleError(error: unknown, context: Record<string, unknown>): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new DatabaseError(`Database request failed (${error.code}).`, {
        code: "song.database_request_failed",
        cause: error,
        context: { ...context, prismaCode: error.code },
      });
    }

    throw new DatabaseError("Unexpected database error while accessing Song data.", {
      code: "song.unexpected_database_error",
      cause: error,
      context,
    });
  }
}
