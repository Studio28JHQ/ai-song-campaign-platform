import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AdminUserRepository } from "@/domain/admin/repositories/AdminUserRepository";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import { BusinessRuleError } from "@/shared/errors";
import type { PasswordHasher } from "../contracts/PasswordHasher";
import type { ChangeAdminPasswordRequest, ChangeAdminPasswordResponse } from "../dto/AdminUserDto";

/** Resets an operator account's password from the Administradores screen. Never stores or logs the plaintext password (see `PasswordHasher`). */
export class ChangeAdminPasswordUseCase {
  constructor(
    private readonly adminUserRepository: AdminUserRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(request: ChangeAdminPasswordRequest): Promise<ChangeAdminPasswordResponse> {
    const admin = await this.adminUserRepository.findById(request.adminId);

    if (!admin) {
      throw new BusinessRuleError("Admin account not found.", {
        code: "admin.user_not_found",
        context: { adminId: request.adminId },
      });
    }

    const passwordHash = await this.passwordHasher.hash(request.newPassword);
    admin.changePasswordHash(passwordHash);
    const updated = await this.adminUserRepository.update(admin);

    await this.auditLogRepository.create(
      AuditLogEntry.create({
        adminId: request.actingAdminId,
        action: "change_admin_password",
        entity: "AdminUser",
        entityId: updated.id,
      }),
    );

    return { admin: updated.toSnapshot() };
  }
}
