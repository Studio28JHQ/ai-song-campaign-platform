import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
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
