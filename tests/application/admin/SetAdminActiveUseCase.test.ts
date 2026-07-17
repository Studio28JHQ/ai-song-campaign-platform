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
    return { items: [], total: 0 };
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
  let superAdmin: AdminUser;

  beforeEach(() => {
    adminUserRepository = new InMemoryAdminUserRepository();
    auditLogRepository = new InMemoryAuditLogRepository();
    superAdmin = AdminUser.create({
      email: "super@example.com",
      passwordHash: "hash",
      name: "Super Admin",
      role: "SUPER_ADMIN",
    });
    adminUserRepository.seed(superAdmin);
  });

  it("deactivates an active account and writes a deactivate_admin_user audit entry", async () => {
    const admin = buildAdmin();
    adminUserRepository.seed(admin);
    const useCase = new SetAdminActiveUseCase(adminUserRepository, auditLogRepository);

    const result = await useCase.execute({
      adminId: admin.id,
      active: false,
      actingAdminId: superAdmin.id,
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
      actingAdminId: superAdmin.id,
    });

    expect(result.admin.active).toBe(true);
    expect(auditLogRepository.created).toEqual([
      { action: "activate_admin_user", entity: "AdminUser", entityId: admin.id },
    ]);
  });

  it("rejects an unknown admin id", async () => {
    const useCase = new SetAdminActiveUseCase(adminUserRepository, auditLogRepository);

    await expect(
      useCase.execute({ adminId: "missing", active: false, actingAdminId: superAdmin.id }),
    ).rejects.toThrow();
  });

  it("rejects when the acting admin is a plain ADMIN, not a SUPER_ADMIN", async () => {
    const admin = buildAdmin();
    adminUserRepository.seed(admin);
    const plainAdmin = AdminUser.create({
      email: "plain@example.com",
      passwordHash: "hash",
      name: "Plain Admin",
      role: "ADMIN",
    });
    adminUserRepository.seed(plainAdmin);
    const useCase = new SetAdminActiveUseCase(adminUserRepository, auditLogRepository);

    await expect(
      useCase.execute({ adminId: admin.id, active: false, actingAdminId: plainAdmin.id }),
    ).rejects.toThrow();
    expect(auditLogRepository.created).toHaveLength(0);
  });

  describe("last-super-admin lockout guard (RC-final — Production Hardening)", () => {
    it("rejects deactivating the only active super admin", async () => {
      const useCase = new SetAdminActiveUseCase(adminUserRepository, auditLogRepository);

      await expect(
        useCase.execute({
          adminId: superAdmin.id,
          active: false,
          actingAdminId: superAdmin.id,
        }),
      ).rejects.toThrow();
      expect(auditLogRepository.created).toHaveLength(0);
      const persisted = await adminUserRepository.findById(superAdmin.id);
      expect(persisted?.active).toBe(true);
    });

    it("allows deactivating a super admin when another active super admin exists", async () => {
      const secondSuperAdmin = AdminUser.create({
        email: "super2@example.com",
        passwordHash: "hash",
        name: "Second Super Admin",
        role: "SUPER_ADMIN",
      });
      adminUserRepository.seed(secondSuperAdmin);
      const useCase = new SetAdminActiveUseCase(adminUserRepository, auditLogRepository);

      const result = await useCase.execute({
        adminId: superAdmin.id,
        active: false,
        actingAdminId: secondSuperAdmin.id,
      });

      expect(result.admin.active).toBe(false);
    });

    it("does not block deactivating the only active super admin's own account by some other super admin, once already inactive elsewhere is irrelevant — only ACTIVE super admins count", async () => {
      const inactiveSecondSuperAdmin = AdminUser.create({
        email: "super3@example.com",
        passwordHash: "hash",
        name: "Inactive Super Admin",
        role: "SUPER_ADMIN",
      });
      inactiveSecondSuperAdmin.deactivate();
      adminUserRepository.seed(inactiveSecondSuperAdmin);
      const useCase = new SetAdminActiveUseCase(adminUserRepository, auditLogRepository);

      await expect(
        useCase.execute({
          adminId: superAdmin.id,
          active: false,
          actingAdminId: superAdmin.id,
        }),
      ).rejects.toThrow();
    });

    it("allows deactivating a plain ADMIN even when they are the only ADMIN (lockout only guards SUPER_ADMIN)", async () => {
      const admin = buildAdmin();
      adminUserRepository.seed(admin);
      const useCase = new SetAdminActiveUseCase(adminUserRepository, auditLogRepository);

      const result = await useCase.execute({
        adminId: admin.id,
        active: false,
        actingAdminId: superAdmin.id,
      });

      expect(result.admin.active).toBe(false);
    });
  });
});
