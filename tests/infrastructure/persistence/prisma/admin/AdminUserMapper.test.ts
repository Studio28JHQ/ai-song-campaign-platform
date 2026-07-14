import { describe, expect, it } from "vitest";
import type { AdminUser as PrismaAdminUserRecord } from "@/generated/prisma/client";
import { AdminUserMapper } from "@/infrastructure/persistence/prisma/admin/AdminUserMapper";

function buildRecord(overrides: Partial<PrismaAdminUserRecord> = {}): PrismaAdminUserRecord {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "admin-1",
    email: "admin@example.com",
    passwordHash: "salt:hash",
    name: "Jane Admin",
    role: "admin",
    active: true,
    lastLogin: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("AdminUserMapper.toDomain", () => {
  it("maps a persisted record into an AdminUser entity, preserving passwordHash internally", () => {
    const admin = AdminUserMapper.toDomain(buildRecord());

    expect(admin.id).toBe("admin-1");
    expect(admin.email).toBe("admin@example.com");
    expect(admin.passwordHash).toBe("salt:hash");
    expect(admin.active).toBe(true);
  });

  it("never leaks passwordHash through toSnapshot", () => {
    const admin = AdminUserMapper.toDomain(buildRecord());
    expect(admin.toSnapshot()).not.toHaveProperty("passwordHash");
  });
});

describe("AdminUserMapper.toUpdateInput", () => {
  it("only ever writes lastLogin and updatedAt", () => {
    const admin = AdminUserMapper.toDomain(buildRecord());
    admin.recordLogin();

    const input = AdminUserMapper.toUpdateInput(admin);

    expect(Object.keys(input).sort()).toEqual(["lastLogin", "updatedAt"]);
  });
});
