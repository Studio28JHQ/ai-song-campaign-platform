import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaAdminLyricsAttemptGate } from "@/infrastructure/persistence/prisma/admin/PrismaAdminLyricsAttemptGate";
import { DatabaseError } from "@/shared/errors";

const LEAD_ID = "11111111-1111-1111-1111-111111111111";
const started = new Date("2026-09-28T10:00:00.000Z");

function fakeClient(records: unknown[]) {
  const findMany = vi.fn().mockResolvedValue(records);
  return {
    findMany,
    client: { generationAttempt: { findMany } } as unknown as PrismaClient,
  };
}

/** Sprint FINAL-2 — Lyrics Generation Traceability. */
describe("PrismaAdminLyricsAttemptGate.findByLead", () => {
  it("returns the lead's attempts in the order the calls happened", async () => {
    const { client, findMany } = fakeClient([
      {
        attemptNumber: 1,
        result: "FAILED",
        errorCode: "CLAUDE_OUTPUT_TOO_LONG",
        failureReason: "Claude's lyrics were 454 characters, over the 360-character maximum.",
        providerModel: "claude-sonnet-5",
        createdAt: started,
        completedAt: new Date("2026-09-28T10:00:12.000Z"),
      },
      {
        attemptNumber: 2,
        result: "SUCCESS",
        errorCode: null,
        failureReason: null,
        providerModel: "claude-sonnet-5",
        createdAt: new Date("2026-09-28T10:00:13.000Z"),
        completedAt: new Date("2026-09-28T10:00:25.000Z"),
      },
    ]);

    const attempts = await new PrismaAdminLyricsAttemptGate(client).findByLead(LEAD_ID);

    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { leadId: LEAD_ID },
      orderBy: { attemptNumber: "asc" },
    });
    expect(attempts.map((attempt) => [attempt.attemptNumber, attempt.result])).toEqual([
      [1, "FAILED"],
      [2, "SUCCESS"],
    ]);
    expect(attempts[0].errorCode).toBe("CLAUDE_OUTPUT_TOO_LONG");
  });

  it("returns an in-flight attempt as STARTED with no completion time, never as a failure", async () => {
    const { client } = fakeClient([
      {
        attemptNumber: 1,
        result: "STARTED",
        errorCode: null,
        failureReason: null,
        providerModel: "claude-sonnet-5",
        createdAt: started,
        completedAt: null,
      },
    ]);

    const [attempt] = await new PrismaAdminLyricsAttemptGate(client).findByLead(LEAD_ID);

    expect(attempt.result).toBe("STARTED");
    expect(attempt.completedAt).toBeNull();
  });

  it("returns an empty list for a lead with no recorded attempts, rather than inventing history", async () => {
    const { client } = fakeClient([]);

    await expect(new PrismaAdminLyricsAttemptGate(client).findByLead(LEAD_ID)).resolves.toEqual([]);
  });

  it("raises a DatabaseError rather than leaking a Prisma failure into the admin route", async () => {
    const { client, findMany } = fakeClient([]);
    findMany.mockRejectedValue(new Error("connection reset"));

    await expect(
      new PrismaAdminLyricsAttemptGate(client).findByLead(LEAD_ID),
    ).rejects.toBeInstanceOf(DatabaseError);
  });
});
