import { describe, expect, it } from "vitest";
import type { AuditLog as PrismaAuditLogRecord } from "@/generated/prisma/client";
import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import { AuditLogMapper } from "@/infrastructure/persistence/prisma/admin/AuditLogMapper";

function buildRecord(overrides: Partial<PrismaAuditLogRecord> = {}): PrismaAuditLogRecord {
  return {
    id: "audit-1",
    adminId: "admin-1",
    action: "login",
    entity: "AdminUser",
    entityId: "admin-1",
    metadata: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("AuditLogMapper.toDomain", () => {
  it("maps a persisted record into an AuditLogEntry entity", () => {
    const entry = AuditLogMapper.toDomain(buildRecord());

    expect(entry.id).toBe("audit-1");
    expect(entry.action).toBe("login");
    expect(entry.entity).toBe("AdminUser");
    expect(entry.entityId).toBe("admin-1");
  });
});

describe("AuditLogMapper.toCreateInput", () => {
  it("maps null metadata to Prisma.JsonNull", () => {
    const entry = AuditLogEntry.create({
      adminId: "admin-1",
      action: "login",
      entity: "AdminUser",
    });
    const input = AuditLogMapper.toCreateInput(entry);

    expect(input.metadata).toBeDefined();
  });
});
