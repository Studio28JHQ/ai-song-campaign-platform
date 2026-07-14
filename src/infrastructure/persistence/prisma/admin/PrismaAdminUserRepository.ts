import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { AdminUser } from "@/domain/admin/entities/AdminUser";
import type { AdminUserRepository } from "@/domain/admin/repositories/AdminUserRepository";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";
import { AdminUserMapper } from "./AdminUserMapper";

/**
 * Prisma implementation of `AdminUserRepository`. No Prisma type or
 * exception ever escapes this class — callers only ever see domain
 * entities and the shared error taxonomy (`@/shared/errors`).
 */
export class PrismaAdminUserRepository implements AdminUserRepository {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async findByEmail(email: string): Promise<AdminUser | null> {
    try {
      const record = await this.client.adminUser.findUnique({ where: { email } });
      return record ? AdminUserMapper.toDomain(record) : null;
    } catch (error) {
      this.handleError(error, { operation: "findByEmail" });
    }
  }

  async update(adminUser: AdminUser): Promise<AdminUser> {
    try {
      const record = await this.client.adminUser.update({
        where: { id: adminUser.id },
        data: AdminUserMapper.toUpdateInput(adminUser),
      });
      return AdminUserMapper.toDomain(record);
    } catch (error) {
      this.handleError(error, { operation: "update", adminId: adminUser.id });
    }
  }

  private handleError(error: unknown, context: Record<string, unknown>): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new DatabaseError(`Database request failed (${error.code}).`, {
        code: "admin.database_request_failed",
        cause: error,
        context: { ...context, prismaCode: error.code },
      });
    }

    throw new DatabaseError("Unexpected database error while accessing AdminUser data.", {
      code: "admin.unexpected_database_error",
      cause: error,
      context,
    });
  }
}
