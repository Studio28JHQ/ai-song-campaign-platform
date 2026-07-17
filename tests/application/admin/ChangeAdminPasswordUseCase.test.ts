import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminUser } from "@/domain/admin/entities/AdminUser";
import type { AdminUserRepository } from "@/domain/admin/repositories/AdminUserRepository";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import { ChangeAdminPasswordUseCase } from "@/application/admin/use-cases/ChangeAdminPasswordUseCase";
import type { PasswordHasher } from "@/application/admin/contracts/PasswordHasher";

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

function fakePasswordHasher(): PasswordHasher {
  return {
    hash: vi.fn().mockResolvedValue("new-hashed-password"),
    verify: vi.fn(),
  };
}

describe("ChangeAdminPasswordUseCase", () => {
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

  it("hashes the new password, persists it, and writes an audit entry", async () => {
    const admin = AdminUser.create({
      email: "admin@example.com",
      passwordHash: "old-hash",
      name: "Jane Admin",
      role: "ADMIN",
    });
    adminUserRepository.seed(admin);
    const passwordHasher = fakePasswordHasher();
    const useCase = new ChangeAdminPasswordUseCase(
      adminUserRepository,
      auditLogRepository,
      passwordHasher,
    );

    await useCase.execute({
      adminId: admin.id,
      newPassword: "new-plaintext",
      actingAdminId: superAdmin.id,
    });

    expect(passwordHasher.hash).toHaveBeenCalledWith("new-plaintext");
    const persisted = await adminUserRepository.findById(admin.id);
    expect(persisted?.passwordHash).toBe("new-hashed-password");
    expect(auditLogRepository.created).toEqual([
      { action: "change_admin_password", entity: "AdminUser", entityId: admin.id },
    ]);
  });

  it("rejects an unknown admin id", async () => {
    const useCase = new ChangeAdminPasswordUseCase(
      adminUserRepository,
      auditLogRepository,
      fakePasswordHasher(),
    );

    await expect(
      useCase.execute({ adminId: "missing", newPassword: "x", actingAdminId: superAdmin.id }),
    ).rejects.toThrow();
  });

  it("rejects when the acting admin is a plain ADMIN, not a SUPER_ADMIN", async () => {
    const admin = AdminUser.create({
      email: "admin@example.com",
      passwordHash: "old-hash",
      name: "Jane Admin",
      role: "ADMIN",
    });
    adminUserRepository.seed(admin);
    const plainAdmin = AdminUser.create({
      email: "plain@example.com",
      passwordHash: "hash",
      name: "Plain Admin",
      role: "ADMIN",
    });
    adminUserRepository.seed(plainAdmin);
    const useCase = new ChangeAdminPasswordUseCase(
      adminUserRepository,
      auditLogRepository,
      fakePasswordHasher(),
    );

    await expect(
      useCase.execute({
        adminId: admin.id,
        newPassword: "new-plaintext",
        actingAdminId: plainAdmin.id,
      }),
    ).rejects.toThrow();
    expect(auditLogRepository.created).toHaveLength(0);
  });
});
