import type { AdminUserRepository } from "@/domain/admin/repositories/AdminUserRepository";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import { ValidationError } from "@/shared/errors";
import type { ListAuditLogRequest, ListAuditLogResponse } from "../dto/ListAuditLogResponse";

export const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

/**
 * Lists the most recent audit entries — admin actions and
 * system-recorded security/abuse events — for the "Auditoría" screen.
 *
 * Sprint FINAL-1 — Production Hardening: added pagination and
 * free-text search (action/entity/entityId) — a hard-capped,
 * unfiltered list of 200 stopped being usable once the campaign
 * generates more entries than that. This use case only
 * validates/normalizes pagination bounds, the same pattern
 * `SearchLeadsUseCase`/`ListLyricsUseCase` already follow — the actual
 * query is the `AuditLogRepository`'s job.
 */
export class ListAuditLogUseCase {
  constructor(
    private readonly auditLogRepository: AuditLogRepository,
    private readonly adminUserRepository: AdminUserRepository,
  ) {}

  async execute(request: ListAuditLogRequest): Promise<ListAuditLogResponse> {
    const page = request.page;
    const pageSize = request.pageSize ?? DEFAULT_PAGE_SIZE;

    if (!Number.isInteger(page) || page < 1) {
      throw new ValidationError("page must be a positive integer.", {
        code: "admin.invalid_page",
        context: { page },
      });
    }

    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new ValidationError(`pageSize must be between 1 and ${MAX_PAGE_SIZE}.`, {
        code: "admin.invalid_page_size",
        context: { pageSize },
      });
    }

    const [{ items: entries, total }, admins] = await Promise.all([
      this.auditLogRepository.findRecent({
        page,
        pageSize,
        query: request.query?.trim() || undefined,
      }),
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
      total,
      page,
      pageSize,
    };
  }
}
