import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AdminUserRepository } from "@/domain/admin/repositories/AdminUserRepository";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import { BusinessRuleError } from "@/shared/errors";
import type { UpdateAdminUserRequest, UpdateAdminUserResponse } from "../dto/AdminUserDto";
import { assertSuperAdmin } from "../services/adminAuthorization";

/** Edits an operator account's name/role from the Administradores screen. Email and password are changed through their own dedicated operations. */
export class UpdateAdminUserUseCase {
  constructor(
    private readonly adminUserRepository: AdminUserRepository,
    private readonly auditLogRepository: AuditLogRepository,
  ) {}

  async execute(request: UpdateAdminUserRequest): Promise<UpdateAdminUserResponse> {
    await assertSuperAdmin(this.adminUserRepository, request.actingAdminId);

    const admin = await this.adminUserRepository.findById(request.adminId);

    if (!admin) {
      throw new BusinessRuleError("Admin account not found.", {
        code: "admin.user_not_found",
        context: { adminId: request.adminId },
      });
    }

    admin.updateProfile({ name: request.name, role: request.role });
    const updated = await this.adminUserRepository.update(admin);

    await this.auditLogRepository.create(
      AuditLogEntry.create({
        adminId: request.actingAdminId,
        action: "update_admin_user",
        entity: "AdminUser",
        entityId: updated.id,
      }),
    );

    return { admin: updated.toSnapshot() };
  }
}
