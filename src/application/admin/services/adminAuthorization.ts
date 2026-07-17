import type { AdminUserRepository } from "@/domain/admin/repositories/AdminUserRepository";
import { BusinessRuleError } from "@/shared/errors";

/**
 * Sprint FINAL-1 — Production Hardening. Admin-user-management actions
 * (create/edit/activate/deactivate/change password/promote role) are
 * restricted to `SUPER_ADMIN`. A plain `ADMIN` may still authenticate
 * and use every operational screen (leads, lyrics, songs, dashboard,
 * audit) — this check only guards the Administradores screen's own
 * write actions, reusing the same `BusinessRuleError` taxonomy every
 * other use case in this module already throws.
 */
export async function assertSuperAdmin(
  adminUserRepository: AdminUserRepository,
  actingAdminId: string,
): Promise<void> {
  const actingAdmin = await adminUserRepository.findById(actingAdminId);

  if (!actingAdmin || actingAdmin.role !== "SUPER_ADMIN") {
    throw new BusinessRuleError("Only a super admin may perform this action.", {
      code: "admin.forbidden",
      context: { actingAdminId },
    });
  }
}
