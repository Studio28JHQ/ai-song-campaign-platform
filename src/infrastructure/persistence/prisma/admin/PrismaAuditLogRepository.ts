import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type {
  AuditLogRepository,
  AuditLogSearchFilter,
  AuditLogSearchResult,
} from "@/domain/admin/repositories/AuditLogRepository";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";
import { AuditLogMapper } from "./AuditLogMapper";

/**
 * Prisma implementation of `AuditLogRepository`. No Prisma type or
 * exception ever escapes this class — callers only ever see domain
 * entities and the shared error taxonomy (`@/shared/errors`).
 */
export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async create(entry: AuditLogEntry): Promise<AuditLogEntry> {
    try {
      const record = await this.client.auditLog.create({
        data: AuditLogMapper.toCreateInput(entry),
      });
      return AuditLogMapper.toDomain(record);
    } catch (error) {
      this.handleError(error, { operation: "create", adminId: entry.adminId });
    }
  }

  async findByEntity(entity: string, entityId: string): Promise<AuditLogEntry[]> {
    try {
      const records = await this.client.auditLog.findMany({
        where: { entity, entityId },
        orderBy: { createdAt: "desc" },
      });
      return records.map(AuditLogMapper.toDomain);
    } catch (error) {
      this.handleError(error, { operation: "findByEntity", entity, entityId });
    }
  }

  async findRecent(filter: AuditLogSearchFilter): Promise<AuditLogSearchResult> {
    try {
      const where = this.buildWhere(filter);

      const [records, total] = await Promise.all([
        this.client.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (filter.page - 1) * filter.pageSize,
          take: filter.pageSize,
        }),
        this.client.auditLog.count({ where }),
      ]);

      return { items: records.map(AuditLogMapper.toDomain), total };
    } catch (error) {
      this.handleError(error, { operation: "findRecent" });
    }
  }

  private buildWhere(filter: AuditLogSearchFilter): Prisma.AuditLogWhereInput {
    if (!filter.query) {
      return {};
    }

    const clauses: Prisma.AuditLogWhereInput[] = [
      { action: { contains: filter.query, mode: "insensitive" } },
      { entity: { contains: filter.query, mode: "insensitive" } },
    ];

    // `entityId` is a UUID column — an exact match only, and only ever
    // attempted when `query` is itself a well-formed UUID, otherwise
    // Postgres rejects the comparison outright.
    if (this.isUuid(filter.query)) {
      clauses.push({ entityId: filter.query });
    }

    return { OR: clauses };
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  private handleError(error: unknown, context: Record<string, unknown>): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new DatabaseError(`Database request failed (${error.code}).`, {
        code: "admin.database_request_failed",
        cause: error,
        context: { ...context, prismaCode: error.code },
      });
    }

    throw new DatabaseError("Unexpected database error while accessing AuditLog data.", {
      code: "admin.unexpected_database_error",
      cause: error,
      context,
    });
  }
}
