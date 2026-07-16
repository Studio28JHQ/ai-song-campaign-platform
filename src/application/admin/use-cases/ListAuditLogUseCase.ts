import type { AdminUserRepository } from "@/domain/admin/repositories/AdminUserRepository";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import type { ListAuditLogResponse } from "../dto/ListAuditLogResponse";

const DEFAULT_LIMIT = 200;

/** Lists the most recent audit entries — admin actions and system-recorded security/abuse events — for the "Auditoría" screen. */
export class ListAuditLogUseCase {
  constructor(
    private readonly auditLogRepository: AuditLogRepository,
    private readonly adminUserRepository: AdminUserRepository,
  ) {}

  async execute(limit: number = DEFAULT_LIMIT): Promise<ListAuditLogResponse> {
    const [entries, admins] = await Promise.all([
      this.auditLogRepository.findRecent(limit),
      this.adminUserRepository.findAll(),
    ]);

    const nameById = new Map(admins.map((admin) => [admin.id, admin.name]));

    return {
      items: entries.map((entry) => ({
        id: entry.id,
        createdAt: entry.createdAt,
        adminName: entry.adminId ? (nameById.get(entry.adminId) ?? entry.adminId) : "Sistema",
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
      })),
    };
  }
}
