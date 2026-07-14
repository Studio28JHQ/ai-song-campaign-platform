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
});
