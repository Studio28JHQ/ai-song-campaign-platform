import { describe, expect, it } from "vitest";
import { AdminUser } from "@/domain/admin/entities/AdminUser";
import type { AdminUserProps } from "@/domain/admin/types";

function buildProps(overrides: Partial<AdminUserProps> = {}): AdminUserProps {
  return {
    id: "admin-1",
    email: "admin@example.com",
    passwordHash: "salt:hash",
    name: "Jane Admin",
    role: "admin",
    active: true,
    lastLogin: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("AdminUser", () => {
  it("allows authentication for an active account", () => {
    const admin = AdminUser.fromPersistence(buildProps({ active: true }));
    expect(() => admin.assertCanAuthenticate()).not.toThrow();
  });

  it("rejects authentication for an inactive account", () => {
    const admin = AdminUser.fromPersistence(buildProps({ active: false }));
    expect(() => admin.assertCanAuthenticate()).toThrow();
  });

  it("records a login by updating lastLogin and updatedAt", () => {
    const admin = AdminUser.fromPersistence(buildProps({ lastLogin: null }));
    const before = Date.now();

    admin.recordLogin();

    expect(admin.lastLogin).not.toBeNull();
    expect(admin.lastLogin!.getTime()).toBeGreaterThanOrEqual(before);
    expect(admin.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("never exposes passwordHash in its snapshot", () => {
    const admin = AdminUser.fromPersistence(buildProps());
    const snapshot = admin.toSnapshot() as unknown as Record<string, unknown>;

    expect(snapshot).not.toHaveProperty("passwordHash");
    expect(snapshot).toEqual({
      id: "admin-1",
      email: "admin@example.com",
      name: "Jane Admin",
      role: "admin",
      active: true,
      lastLogin: null,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    });
  });

  describe("create", () => {
    function buildInput(overrides: Partial<Parameters<typeof AdminUser.create>[0]> = {}) {
      return {
        email: "New.Admin@Example.com",
        passwordHash: "salt:hash",
        name: "New Admin",
        role: "ADMIN",
        ...overrides,
      };
    }

    it("creates an active account with a lowercased email", () => {
      const admin = AdminUser.create(buildInput());

      expect(admin.email).toBe("new.admin@example.com");
      expect(admin.active).toBe(true);
      expect(admin.lastLogin).toBeNull();
      expect(admin.role).toBe("ADMIN");
    });

    it("rejects an invalid email format", () => {
      expect(() => AdminUser.create(buildInput({ email: "not-an-email" }))).toThrow();
    });

    it("rejects an empty name", () => {
      expect(() => AdminUser.create(buildInput({ name: "  " }))).toThrow();
    });

    it("rejects a role outside ADMIN_ROLES", () => {
      expect(() => AdminUser.create(buildInput({ role: "SUPERUSER" }))).toThrow();
    });

    it("accepts SUPER_ADMIN", () => {
      const admin = AdminUser.create(buildInput({ role: "SUPER_ADMIN" }));
      expect(admin.role).toBe("SUPER_ADMIN");
    });
  });

  describe("updateProfile", () => {
    it("updates name and role", () => {
      const admin = AdminUser.fromPersistence(buildProps());
      admin.updateProfile({ name: "Renamed Admin", role: "SUPER_ADMIN" });

      expect(admin.name).toBe("Renamed Admin");
      expect(admin.role).toBe("SUPER_ADMIN");
    });

    it("rejects an invalid role", () => {
      const admin = AdminUser.fromPersistence(buildProps());
      expect(() => admin.updateProfile({ name: "X", role: "SUPERUSER" })).toThrow();
    });
  });

  describe("changePasswordHash", () => {
    it("replaces the stored hash", () => {
      const admin = AdminUser.fromPersistence(buildProps());
      admin.changePasswordHash("new-salt:new-hash");
      expect(admin.passwordHash).toBe("new-salt:new-hash");
    });
  });

  describe("activate / deactivate", () => {
    it("deactivates an active account", () => {
      const admin = AdminUser.fromPersistence(buildProps({ active: true }));
      admin.deactivate();
      expect(admin.active).toBe(false);
    });

    it("reactivates an inactive account", () => {
      const admin = AdminUser.fromPersistence(buildProps({ active: false }));
      admin.activate();
      expect(admin.active).toBe(true);
    });
  });
});
