import { AdminUser } from "@/domain/admin/entities/AdminUser";
import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AdminUserRepository } from "@/domain/admin/repositories/AdminUserRepository";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import { BusinessRuleError } from "@/shared/errors";
import type { PasswordHasher } from "../contracts/PasswordHasher";
import type { CreateAdminUserRequest, CreateAdminUserResponse } from "../dto/AdminUserDto";
import { assertSuperAdmin } from "../services/adminAuthorization";

/**
 * Creates a new campaign operator account (Sprint ADMIN-1 — Backoffice
 * de Campaña). There is no self-registration for admins — every account
 * is provisioned here, by another admin, from the Administradores screen.
 */
export class CreateAdminUserUseCase {
  constructor(
    private readonly adminUserRepository: AdminUserRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(request: CreateAdminUserRequest): Promise<CreateAdminUserResponse> {
    await assertSuperAdmin(this.adminUserRepository, request.actingAdminId);

    const normalizedEmail = request.email.trim().toLowerCase();
    const existing = await this.adminUserRepository.findByEmail(normalizedEmail);

    if (existing) {
      throw new BusinessRuleError("An admin account with this email already exists.", {
        code: "admin.email_already_exists",
        context: { email: normalizedEmail },
      });
    }

    const passwordHash = await this.passwordHasher.hash(request.password);

    const admin = AdminUser.create({
      email: normalizedEmail,
      passwordHash,
      name: request.name,
      role: request.role,
    });

    const created = await this.adminUserRepository.create(admin);

    await this.auditLogRepository.create(
      AuditLogEntry.create({
        adminId: request.actingAdminId,
        action: "create_admin_user",
        entity: "AdminUser",
        entityId: created.id,
      }),
    );

    return { admin: created.toSnapshot() };
  }
}
