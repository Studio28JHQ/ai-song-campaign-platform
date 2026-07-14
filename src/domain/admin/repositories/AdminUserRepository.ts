import type { AdminUser } from "../entities/AdminUser";

/**
 * Persistence contract for the AdminUser aggregate. Interface only — no
 * implementation. A concrete adapter (Prisma or otherwise) belongs in
 * `src/infrastructure/`, not here.
 *
 * Deliberately has no `create`: there is no account-creation flow in this
 * module (user management is out of scope — see PROJECT_MANIFEST.md).
 * `update` exists only to persist login bookkeeping (`lastLogin`).
 */
export interface AdminUserRepository {
  findByEmail(email: string): Promise<AdminUser | null>;
  update(adminUser: AdminUser): Promise<AdminUser>;
}
