import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminUser } from "@/domain/admin/entities/AdminUser";
import type { AdminUserRepository } from "@/domain/admin/repositories/AdminUserRepository";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import { CreateAdminUserUseCase } from "@/application/admin/use-cases/CreateAdminUserUseCase";
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
    hash: vi.fn().mockResolvedValue("hashed-password"),
    verify: vi.fn(),
  };
}

describe("CreateAdminUserUseCase", () => {
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

  it("creates a new admin with a hashed password and writes an audit entry", async () => {
    const passwordHasher = fakePasswordHasher();
    const useCase = new CreateAdminUserUseCase(
      adminUserRepository,
      auditLogRepository,
      passwordHasher,
    );

    const result = await useCase.execute({
      email: "New.Admin@Example.com",
      password: "plaintext-password",
      name: "New Admin",
      role: "ADMIN",
      actingAdminId: superAdmin.id,
    });

    expect(passwordHasher.hash).toHaveBeenCalledWith("plaintext-password");
    expect(result.admin.email).toBe("new.admin@example.com");
    expect(result.admin).not.toHaveProperty("passwordHash");

    const persisted = await adminUserRepository.findByEmail("new.admin@example.com");
    expect(persisted?.passwordHash).toBe("hashed-password");

    expect(auditLogRepository.created).toEqual([
      { action: "create_admin_user", entity: "AdminUser", entityId: result.admin.id },
    ]);
  });

  it("rejects a duplicate email", async () => {
    adminUserRepository.seed(
      AdminUser.create({
        email: "existing@example.com",
        passwordHash: "hash",
        name: "Existing Admin",
        role: "ADMIN",
      }),
    );

    const useCase = new CreateAdminUserUseCase(
      adminUserRepository,
      auditLogRepository,
      fakePasswordHasher(),
    );

    await expect(
      useCase.execute({
        email: "existing@example.com",
        password: "x",
        name: "Y",
        role: "ADMIN",
        actingAdminId: superAdmin.id,
      }),
    ).rejects.toThrow();
    expect(auditLogRepository.created).toHaveLength(0);
  });

  it("rejects when the acting admin is a plain ADMIN, not a SUPER_ADMIN", async () => {
    const plainAdmin = AdminUser.create({
      email: "plain@example.com",
      passwordHash: "hash",
      name: "Plain Admin",
      role: "ADMIN",
    });
    adminUserRepository.seed(plainAdmin);
    const useCase = new CreateAdminUserUseCase(
      adminUserRepository,
      auditLogRepository,
      fakePasswordHasher(),
    );

    await expect(
      useCase.execute({
        email: "new.admin@example.com",
        password: "plaintext-password",
        name: "New Admin",
        role: "ADMIN",
        actingAdminId: plainAdmin.id,
      }),
    ).rejects.toThrow();
    expect(auditLogRepository.created).toHaveLength(0);
  });

  it("rejects when the acting admin does not exist", async () => {
    const useCase = new CreateAdminUserUseCase(
      adminUserRepository,
      auditLogRepository,
      fakePasswordHasher(),
    );

    await expect(
      useCase.execute({
        email: "new.admin@example.com",
        password: "plaintext-password",
        name: "New Admin",
        role: "ADMIN",
        actingAdminId: "missing",
      }),
    ).rejects.toThrow();
    expect(auditLogRepository.created).toHaveLength(0);
  });
});
