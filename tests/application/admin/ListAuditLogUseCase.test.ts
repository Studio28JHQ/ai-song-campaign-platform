import { describe, expect, it } from "vitest";
import { AdminUser } from "@/domain/admin/entities/AdminUser";
import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AdminUserRepository } from "@/domain/admin/repositories/AdminUserRepository";
import type {
  AuditLogRepository,
  AuditLogSearchFilter,
} from "@/domain/admin/repositories/AuditLogRepository";
import { ListAuditLogUseCase } from "@/application/admin/use-cases/ListAuditLogUseCase";

class FakeAdminUserRepository implements AdminUserRepository {
  constructor(private readonly admins: AdminUser[]) {}
  async findByEmail(): Promise<AdminUser | null> {
    return null;
  }
  async findById(): Promise<AdminUser | null> {
    return null;
  }
  async findAll(): Promise<AdminUser[]> {
    return this.admins;
  }
  async create(admin: AdminUser): Promise<AdminUser> {
    return admin;
  }
  async update(admin: AdminUser): Promise<AdminUser> {
    return admin;
  }
}

class FakeAuditLogRepository implements AuditLogRepository {
  constructor(private readonly entries: AuditLogEntry[]) {}
  async create(entry: AuditLogEntry): Promise<AuditLogEntry> {
    return entry;
  }
  async findByEntity(): Promise<AuditLogEntry[]> {
    return [];
  }
  async findRecent(
    filter: AuditLogSearchFilter,
  ): Promise<{ items: AuditLogEntry[]; total: number }> {
    const start = (filter.page - 1) * filter.pageSize;
    const page = this.entries.slice(start, start + filter.pageSize);
    return { items: page, total: this.entries.length };
  }
}

describe("ListAuditLogUseCase", () => {
  it("resolves the acting admin's name for an admin-attributed entry", async () => {
    const admin = AdminUser.create({
      email: "admin@example.com",
      passwordHash: "hash",
      name: "Jane Admin",
      role: "ADMIN",
    });
    const entry = AuditLogEntry.create({
      adminId: admin.id,
      action: "login",
      entity: "AdminUser",
      entityId: admin.id,
    });

    const useCase = new ListAuditLogUseCase(
      new FakeAuditLogRepository([entry]),
      new FakeAdminUserRepository([admin]),
    );

    const result = await useCase.execute({ page: 1 });

    expect(result.items).toEqual([
      {
        id: entry.id,
        createdAt: entry.createdAt,
        adminName: "Jane Admin",
        action: "login",
        entity: "AdminUser",
        entityId: admin.id,
      },
    ]);
  });

  it("labels a system-recorded event (adminId: null) as Sistema", async () => {
    const entry = AuditLogEntry.create({
      adminId: null,
      action: "rate_limit_exceeded",
      entity: "IpAddress",
      entityId: "1.2.3.4",
    });

    const useCase = new ListAuditLogUseCase(
      new FakeAuditLogRepository([entry]),
      new FakeAdminUserRepository([]),
    );

    const result = await useCase.execute({ page: 1 });

    expect(result.items[0].adminName).toBe("Sistema");
  });

  it("falls back to the raw adminId if the admin can no longer be found", async () => {
    const entry = AuditLogEntry.create({
      adminId: "deleted-admin",
      action: "login",
      entity: "AdminUser",
      entityId: "deleted-admin",
    });

    const useCase = new ListAuditLogUseCase(
      new FakeAuditLogRepository([entry]),
      new FakeAdminUserRepository([]),
    );

    const result = await useCase.execute({ page: 1 });

    expect(result.items[0].adminName).toBe("deleted-admin");
  });
});
