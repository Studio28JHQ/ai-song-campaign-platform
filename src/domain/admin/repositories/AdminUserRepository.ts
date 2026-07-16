import type { AdminUser } from "../entities/AdminUser";

/**
 * Persistence contract for the AdminUser aggregate. Interface only — no
 * implementation. A concrete adapter (Prisma or otherwise) belongs in
 * `src/infrastructure/`, not here.
 *
 * Sprint ADMIN-1 (Backoffice de Campaña) added `findAll`/`findById`/
 * `create` for the Administradores screen — `update` persists any of
 * profile/password/active-state changes made via the `AdminUser` entity.
 */
export interface AdminUserRepository {
  findByEmail(email: string): Promise<AdminUser | null>;
  findById(id: string): Promise<AdminUser | null>;
  findAll(): Promise<AdminUser[]>;
  create(adminUser: AdminUser): Promise<AdminUser>;
  update(adminUser: AdminUser): Promise<AdminUser>;
}
