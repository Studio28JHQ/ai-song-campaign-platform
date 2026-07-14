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

  /** Only `lastLogin`/`updatedAt` are ever written by this module — there is no create/edit flow (see `AdminUserRepository`). */
  static toUpdateInput(adminUser: AdminUser): Prisma.AdminUserUncheckedUpdateInput {
    return {
      lastLogin: adminUser.lastLogin,
      updatedAt: adminUser.updatedAt,
    };
  }
}
