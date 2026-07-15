import { describe, expect, it } from "vitest";
import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";

describe("AuditLogEntry.create", () => {
  it("creates an entry with a generated id and timestamp", () => {
    const entry = AuditLogEntry.create({
      adminId: "admin-1",
      action: "login",
      entity: "AdminUser",
      entityId: "admin-1",
    });

    expect(entry.id).toBeTruthy();
    expect(entry.adminId).toBe("admin-1");
    expect(entry.action).toBe("login");
    expect(entry.entity).toBe("AdminUser");
    expect(entry.entityId).toBe("admin-1");
    expect(entry.metadata).toBeNull();
    expect(entry.createdAt).toBeInstanceOf(Date);
  });

  it("defaults entityId and metadata to null when omitted", () => {
    const entry = AuditLogEntry.create({
      adminId: "admin-1",
      action: "login",
      entity: "AdminUser",
    });
    expect(entry.entityId).toBeNull();
    expect(entry.metadata).toBeNull();
  });

  it("rejects an empty action", () => {
    expect(() =>
      AuditLogEntry.create({ adminId: "admin-1", action: "  ", entity: "AdminUser" }),
    ).toThrow();
  });

  it("accepts a null adminId for a system-recorded security event (Sprint 8.2)", () => {
    const entry = AuditLogEntry.create({
      adminId: null,
      action: "rate_limit_exceeded",
      entity: "IpAddress",
      metadata: { ip: "203.0.113.4" },
    });

    expect(entry.adminId).toBeNull();
    expect(entry.action).toBe("rate_limit_exceeded");
    expect(entry.metadata).toEqual({ ip: "203.0.113.4" });
  });

  it("round-trips through a snapshot", () => {
    const entry = AuditLogEntry.create({
      adminId: "admin-1",
      action: "view_lead",
      entity: "Lead",
      entityId: "lead-1",
    });

    expect(entry.toSnapshot()).toEqual({
      id: entry.id,
      adminId: "admin-1",
      action: "view_lead",
      entity: "Lead",
      entityId: "lead-1",
      metadata: null,
      createdAt: entry.createdAt,
    });
  });
});
