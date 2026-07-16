import type { AdminUser as PrismaAdminUserRecord, Prisma } from "@/generated/prisma/client";
import { AdminUser } from "@/domain/admin/entities/AdminUser";
import type { AdminUserProps } from "@/domain/admin/types";

/** Translates between the Prisma `AdminUser` model and the `AdminUser` domain entity. Infrastructure-only — never imported outside this layer. */
export class AdminUserMapper {
  static toDomain(record: PrismaAdminUserRecord): AdminUser {
    const props: AdminUserProps = {
      id: record.id,
      email: record.email,
      passwordHash: record.passwordHash,
      name: record.name,
      role: record.role,
      active: record.active,
      lastLogin: record.lastLogin,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };

    return AdminUser.fromPersistence(props);
  }

  /** Persists every mutable field — profile, password, active-state and login bookkeeping all flow through the same entity (see `AdminUser`). */
  static toUpdateInput(adminUser: AdminUser): Prisma.AdminUserUncheckedUpdateInput {
    return {
      name: adminUser.name,
      role: adminUser.role,
      passwordHash: adminUser.passwordHash,
      active: adminUser.active,
      lastLogin: adminUser.lastLogin,
      updatedAt: adminUser.updatedAt,
    };
  }

  static toCreateInput(adminUser: AdminUser): Prisma.AdminUserUncheckedCreateInput {
    return {
      id: adminUser.id,
      email: adminUser.email,
      passwordHash: adminUser.passwordHash,
      name: adminUser.name,
      role: adminUser.role,
      active: adminUser.active,
      lastLogin: adminUser.lastLogin,
      createdAt: adminUser.createdAt,
      updatedAt: adminUser.updatedAt,
    };
  }
}
