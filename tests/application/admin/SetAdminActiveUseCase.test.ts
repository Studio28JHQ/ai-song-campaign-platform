import { beforeEach, describe, expect, it } from "vitest";
import { AdminUser } from "@/domain/admin/entities/AdminUser";
import type { AdminUserRepository } from "@/domain/admin/repositories/AdminUserRepository";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import { SetAdminActiveUseCase } from "@/application/admin/use-cases/SetAdminActiveUseCase";

class InMemoryAdminUserRepository implements AdminUserRepository {
  private readonly records = new Map<string, AdminUser>();
  seed(admin: AdminUser): void {
    this.records.set(admin.id, admin);
  }
  async findByEmail(email: string): Promise<AdminUser | null> {
    return [...this.records.values()].find((admin) => admin.email === email) ?? null;
  }
  async findById(id: string): Promise<AdminUser | null> {
    return this.records.get(id) ?? null;
  }
  async findAll(): Promise<AdminUser[]> {
    return [...this.records.values()];
  }
  async create(admin: AdminUser): Promise<AdminUser> {
    this.records.set(admin.id, admin);
    return admin;
  }
  async update(admin: AdminUser): Promise<AdminUser> {
    this.records.set(admin.id, admin);
    return admin;
  }
}

class InMemoryAuditLogRepository implements AuditLogRepository {
  public created: Array<{ action: string; entity: string; entityId: string | null }> = [];
  async create(entry: Parameters<AuditLogRepository["create"]>[0]) {
    this.created.push({ action: entry.action, entity: entry.entity, entityId: entry.entityId });
    return entry;
  }
  async findByEntity() {
    return [];
  }
  async findRecent() {
    return [];
  }
}

function buildAdmin(): AdminUser {
  return AdminUser.create({
    email: "admin@example.com",
    passwordHash: "hash",
    name: "Jane Admin",
    role: "ADMIN",
  });
}

describe("SetAdminActiveUseCase", () => {
  let adminUserRepository: InMemoryAdminUserRepository;
  let auditLogRepository: InMemoryAuditLogRepository;

  beforeEach(() => {
    adminUserRepository = new InMemoryAdminUserRepository();
    auditLogRepository = new InMemoryAuditLogRepository();
  });

  it("deactivates an active account and writes a deactivate_admin_user audit entry", async () => {
    const admin = buildAdmin();
    adminUserRepository.seed(admin);
    const useCase = new SetAdminActiveUseCase(adminUserRepository, auditLogRepository);

    const result = await useCase.execute({
      adminId: admin.id,
      active: false,
      actingAdminId: "admin-9",
    });

    expect(result.admin.active).toBe(false);
    expect(auditLogRepository.created).toEqual([
      { action: "deactivate_admin_user", entity: "AdminUser", entityId: admin.id },
    ]);
  });

  it("reactivates an inactive account and writes an activate_admin_user audit entry", async () => {
    const admin = buildAdmin();
    admin.deactivate();
    adminUserRepository.seed(admin);
    const useCase = new SetAdminActiveUseCase(adminUserRepository, auditLogRepository);

    const result = await useCase.execute({
      adminId: admin.id,
      active: true,
      actingAdminId: "admin-9",
    });

    expect(result.admin.active).toBe(true);
    expect(auditLogRepository.created).toEqual([
      { action: "activate_admin_user", entity: "AdminUser", entityId: admin.id },
    ]);
  });

  it("rejects an unknown admin id", async () => {
    const useCase = new SetAdminActiveUseCase(adminUserRepository, auditLogRepository);

    await expect(
      useCase.execute({ adminId: "missing", active: false, actingAdminId: "admin-1" }),
    ).rejects.toThrow();
  });
});
