import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AdminUserRepository } from "@/domain/admin/repositories/AdminUserRepository";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import { BusinessRuleError } from "@/shared/errors";
import type { SetAdminActiveRequest, SetAdminActiveResponse } from "../dto/AdminUserDto";

/** Activates/deactivates an operator account (soft delete — see `AdminUser.deactivate`) from the Administradores screen. */
export class SetAdminActiveUseCase {
  constructor(
    private readonly adminUserRepository: AdminUserRepository,
    private readonly auditLogRepository: AuditLogRepository,
  ) {}

  async execute(request: SetAdminActiveRequest): Promise<SetAdminActiveResponse> {
    const admin = await this.adminUserRepository.findById(request.adminId);

    if (!admin) {
      throw new BusinessRuleError("Admin account not found.", {
        code: "admin.user_not_found",
        context: { adminId: request.adminId },
      });
    }

    if (request.active) {
      admin.activate();
    } else {
      admin.deactivate();
    }

    const updated = await this.adminUserRepository.update(admin);

    await this.auditLogRepository.create(
      AuditLogEntry.create({
        adminId: request.actingAdminId,
        action: request.active ? "activate_admin_user" : "deactivate_admin_user",
        entity: "AdminUser",
        entityId: updated.id,
      }),
    );

    return { admin: updated.toSnapshot() };
  }
}
