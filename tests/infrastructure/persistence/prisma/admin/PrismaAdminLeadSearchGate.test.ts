import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaAdminLeadSearchGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminLeadSearchGate";

const now = new Date("2026-01-01T00:00:00.000Z");

function fakeClient(records: unknown[], total: number): PrismaClient {
  return {
    lead: {
      findMany: vi.fn().mockResolvedValue(records),
      count: vi.fn().mockResolvedValue(total),
    },
  } as unknown as PrismaClient;
}

describe("PrismaAdminLeadSearchGate.search", () => {
  it("maps records to rows, translating song status to the public vocabulary", async () => {
    const client = fakeClient(
      [
        {
          id: "lead-1",
          createdAt: now,
          parentName: "Jane Doe",
          babyName: "Baby Doe",
          email: "jane@example.com",
          phone: "+1 555 123 4567",
          song: { status: "READY", emailedAt: now },
        },
        {
          id: "lead-2",
          createdAt: now,
          parentName: "John Smith",
          babyName: "Baby Smith",
          email: "john@example.com",
          phone: null,
          song: null,
        },
      ],
      2,
    );
    const gate = new PrismaAdminLeadSearchGate(client);

    const result = await gate.search({ page: 1, pageSize: 20 });

    expect(result.total).toBe(2);
    expect(result.items[0]).toEqual({
      id: "lead-1",
      createdAt: now,
      parentName: "Jane Doe",
      babyName: "Baby Doe",
      email: "jane@example.com",
      phone: "+1 555 123 4567",
      songStatus: "COMPLETED",
      emailSent: true,
    });
    expect(result.items[1].songStatus).toBeNull();
    expect(result.items[1].emailSent).toBe(false);
  });

  it("applies pagination via skip/take", async () => {
    const client = fakeClient([], 0);
    const gate = new PrismaAdminLeadSearchGate(client);

    await gate.search({ page: 3, pageSize: 10 });

    expect(client.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it("builds a case-insensitive OR filter across parent name, baby name, email, and phone", async () => {
    const client = fakeClient([], 0);
    const gate = new PrismaAdminLeadSearchGate(client);

    await gate.search({ query: "jane", page: 1, pageSize: 20 });

    const call = (client.lead.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.OR).toEqual([
      { parentName: { contains: "jane", mode: "insensitive" } },
      { babyName: { contains: "jane", mode: "insensitive" } },
      { email: { contains: "jane", mode: "insensitive" } },
      { phone: { contains: "jane", mode: "insensitive" } },
    ]);
  });

  it("throws a shared DatabaseError on an unexpected failure", async () => {
    const client = {
      lead: {
        findMany: vi.fn().mockRejectedValue(new Error("connection lost")),
        count: vi.fn(),
      },
    } as unknown as PrismaClient;
    const gate = new PrismaAdminLeadSearchGate(client);

    await expect(gate.search({ page: 1, pageSize: 20 })).rejects.toThrow();
  });
});
