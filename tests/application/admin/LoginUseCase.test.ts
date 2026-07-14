import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminUser } from "@/domain/admin/entities/AdminUser";
import type { AdminUserRepository } from "@/domain/admin/repositories/AdminUserRepository";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import type { AdminUserProps } from "@/domain/admin/types";
import { LoginUseCase } from "@/application/admin/use-cases/LoginUseCase";
import type { PasswordHasher } from "@/application/admin/contracts/PasswordHasher";
import type { SessionTokenService } from "@/application/admin/contracts/SessionTokenService";

class InMemoryAdminUserRepository implements AdminUserRepository {
  private readonly records = new Map<string, AdminUser>();
  seed(admin: AdminUser): void {
    this.records.set(admin.email, admin);
  }
  async findByEmail(email: string): Promise<AdminUser | null> {
    return this.records.get(email) ?? null;
  }
  async update(admin: AdminUser): Promise<AdminUser> {
    this.records.set(admin.email, admin);
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
}

function buildAdmin(overrides: Partial<AdminUserProps> = {}): AdminUser {
  return AdminUser.fromPersistence({
    id: "admin-1",
    email: "admin@example.com",
    passwordHash: "stored-hash",
    name: "Jane Admin",
    role: "admin",
    active: true,
    lastLogin: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  });
}

function fakePasswordHasher(matches: boolean): PasswordHasher {
  return {
    hash: vi.fn(),
    verify: vi.fn().mockResolvedValue(matches),
  };
}

function fakeSessionTokenService(): SessionTokenService {
  return {
    issue: vi
      .fn()
      .mockResolvedValue({
        token: "signed-token",
        expiresAt: new Date("2026-01-02T00:00:00.000Z"),
      }),
    verify: vi.fn(),
  };
}

describe("LoginUseCase", () => {
  let adminUserRepository: InMemoryAdminUserRepository;
  let auditLogRepository: InMemoryAuditLogRepository;

  beforeEach(() => {
    adminUserRepository = new InMemoryAdminUserRepository();
    auditLogRepository = new InMemoryAuditLogRepository();
  });

  it("logs in successfully, records lastLogin, issues a token, and writes an audit entry", async () => {
    adminUserRepository.seed(buildAdmin());
    const sessionTokenService = fakeSessionTokenService();
    const useCase = new LoginUseCase(
      adminUserRepository,
      auditLogRepository,
      fakePasswordHasher(true),
      sessionTokenService,
    );

    const result = await useCase.execute({
      email: "admin@example.com",
      password: "correct-password",
    });

    expect(result.admin.email).toBe("admin@example.com");
    expect(result.token).toBe("signed-token");
    expect(sessionTokenService.issue).toHaveBeenCalledWith(
      { adminId: "admin-1", email: "admin@example.com" },
      { rememberMe: undefined },
    );

    const persisted = await adminUserRepository.findByEmail("admin@example.com");
    expect(persisted?.lastLogin).not.toBeNull();

    expect(auditLogRepository.created).toEqual([
      { action: "login", entity: "AdminUser", entityId: "admin-1" },
    ]);
  });

  it("normalizes the email (trim + lowercase) before looking it up", async () => {
    adminUserRepository.seed(buildAdmin());
    const useCase = new LoginUseCase(
      adminUserRepository,
      auditLogRepository,
      fakePasswordHasher(true),
      fakeSessionTokenService(),
    );

    const result = await useCase.execute({ email: "  ADMIN@Example.com  ", password: "x" });
    expect(result.admin.email).toBe("admin@example.com");
  });

  it("rejects an unknown email with a generic invalid-credentials error", async () => {
    const useCase = new LoginUseCase(
      adminUserRepository,
      auditLogRepository,
      fakePasswordHasher(true),
      fakeSessionTokenService(),
    );

    await expect(useCase.execute({ email: "missing@example.com", password: "x" })).rejects.toThrow(
      "Invalid email or password.",
    );
    expect(auditLogRepository.created).toHaveLength(0);
  });

  it("rejects a wrong password with the same generic invalid-credentials error", async () => {
    adminUserRepository.seed(buildAdmin());
    const useCase = new LoginUseCase(
      adminUserRepository,
      auditLogRepository,
      fakePasswordHasher(false),
      fakeSessionTokenService(),
    );

    await expect(
      useCase.execute({ email: "admin@example.com", password: "wrong-password" }),
    ).rejects.toThrow("Invalid email or password.");
    expect(auditLogRepository.created).toHaveLength(0);
  });

  it("rejects an inactive account, without issuing a token", async () => {
    adminUserRepository.seed(buildAdmin({ active: false }));
    const sessionTokenService = fakeSessionTokenService();
    const useCase = new LoginUseCase(
      adminUserRepository,
      auditLogRepository,
      fakePasswordHasher(true),
      sessionTokenService,
    );

    await expect(
      useCase.execute({ email: "admin@example.com", password: "correct-password" }),
    ).rejects.toThrow();
    expect(sessionTokenService.issue).not.toHaveBeenCalled();
  });

  it("passes rememberMe through to the session token service", async () => {
    adminUserRepository.seed(buildAdmin());
    const sessionTokenService = fakeSessionTokenService();
    const useCase = new LoginUseCase(
      adminUserRepository,
      auditLogRepository,
      fakePasswordHasher(true),
      sessionTokenService,
    );

    await useCase.execute({ email: "admin@example.com", password: "x", rememberMe: true });

    expect(sessionTokenService.issue).toHaveBeenCalledWith(expect.anything(), { rememberMe: true });
  });
});
