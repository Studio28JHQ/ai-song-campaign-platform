import { beforeEach, describe, expect, it } from "vitest";
import { AdminUser } from "@/domain/admin/entities/AdminUser";
import type { AdminUserRepository } from "@/domain/admin/repositories/AdminUserRepository";
import { ListAdminUsersUseCase } from "@/application/admin/use-cases/ListAdminUsersUseCase";

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

describe("ListAdminUsersUseCase", () => {
  let adminUserRepository: InMemoryAdminUserRepository;

  beforeEach(() => {
    adminUserRepository = new InMemoryAdminUserRepository();
  });

  it("returns every admin as a snapshot, never leaking passwordHash", async () => {
    adminUserRepository.seed(
      AdminUser.create({
        email: "admin@example.com",
        passwordHash: "hash",
        name: "Jane Admin",
        role: "ADMIN",
      }),
    );

    const useCase = new ListAdminUsersUseCase(adminUserRepository);
    const result = await useCase.execute();

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty("passwordHash");
    expect(result.items[0].email).toBe("admin@example.com");
  });

  it("returns an empty list when there are no admins", async () => {
    const useCase = new ListAdminUsersUseCase(adminUserRepository);
    const result = await useCase.execute();
    expect(result.items).toEqual([]);
  });
});
