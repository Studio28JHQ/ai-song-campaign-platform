import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AdminUserRepository } from "@/domain/admin/repositories/AdminUserRepository";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import { BusinessRuleError } from "@/shared/errors";
import type { SetAdminActiveRequest, SetAdminActiveResponse } from "../dto/AdminUserDto";
import { assertSuperAdmin } from "../services/adminAuthorization";

/** Activates/deactivates an operator account (soft delete — see `AdminUser.deactivate`) from the Administradores screen. */
export class SetAdminActiveUseCase {
  constructor(
    private readonly adminUserRepository: AdminUserRepository,
    private readonly auditLogRepository: AuditLogRepository,
  ) {}

  async execute(request: SetAdminActiveRequest): Promise<SetAdminActiveResponse> {
    await assertSuperAdmin(this.adminUserRepository, request.actingAdminId);

    const admin = await this.adminUserRepository.findById(request.adminId);

    if (!admin) {
      throw new BusinessRuleError("Admin account not found.", {
        code: "admin.user_not_found",
        context: { adminId: request.adminId },
      });
    }

    if (!request.active) {
      const allAdmins = await this.adminUserRepository.findAll();
      const otherActiveSuperAdmins = allAdmins.filter(
        (candidate) =>
          candidate.id !== admin.id && candidate.role === "SUPER_ADMIN" && candidate.active,
      );

      if (admin.role === "SUPER_ADMIN" && otherActiveSuperAdmins.length === 0) {
        throw new BusinessRuleError("Cannot deactivate the last active super admin.", {
          code: "admin.cannot_deactivate_last_super_admin",
          context: { adminId: request.adminId },
        });
      }
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
