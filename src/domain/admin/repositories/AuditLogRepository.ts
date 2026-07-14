import type { AuditLogEntry } from "../entities/AuditLogEntry";

/**
 * Persistence contract for the AuditLogEntry aggregate. Interface only —
 * no implementation. A concrete adapter (Prisma or otherwise) belongs in
 * `src/infrastructure/`, not here.
 */
export interface AuditLogRepository {
  create(entry: AuditLogEntry): Promise<AuditLogEntry>;
  findByEntity(entity: string, entityId: string): Promise<AuditLogEntry[]>;
}
