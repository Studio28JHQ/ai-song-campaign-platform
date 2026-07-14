import { Prisma, type AuditLog as PrismaAuditLogRecord } from "@/generated/prisma/client";
import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AuditLogEntryProps } from "@/domain/admin/types";

/** Translates between the Prisma `AuditLog` model and the `AuditLogEntry` domain entity. Infrastructure-only — never imported outside this layer. */
export class AuditLogMapper {
  static toDomain(record: PrismaAuditLogRecord): AuditLogEntry {
    const props: AuditLogEntryProps = {
      id: record.id,
      adminId: record.adminId,
      action: record.action,
      entity: record.entity,
      entityId: record.entityId,
      metadata: (record.metadata as Record<string, unknown> | null) ?? null,
      createdAt: record.createdAt,
    };

    return AuditLogEntry.fromPersistence(props);
  }

  static toCreateInput(entry: AuditLogEntry): Prisma.AuditLogUncheckedCreateInput {
    return {
      id: entry.id,
      adminId: entry.adminId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      metadata:
        entry.metadata === null ? Prisma.JsonNull : (entry.metadata as Prisma.InputJsonValue),
      createdAt: entry.createdAt,
    };
  }
}
