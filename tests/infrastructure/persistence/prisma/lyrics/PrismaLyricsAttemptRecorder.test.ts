import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaLyricsAttemptRecorder } from "@/infrastructure/persistence/prisma/lyrics/PrismaLyricsAttemptRecorder";
import { DatabaseError } from "@/shared/errors";

const LEAD_ID = "11111111-1111-1111-1111-111111111111";

function fakeClient(options: { maxAttemptNumber?: number | null } = {}) {
  const aggregate = vi
    .fn()
    .mockResolvedValue({ _max: { attemptNumber: options.maxAttemptNumber ?? null } });
  const create = vi.fn().mockResolvedValue({ id: "attempt-row-1" });
  const update = vi.fn().mockResolvedValue({});

  return {
    aggregate,
    create,
    update,
    client: { generationAttempt: { aggregate, create, update } } as unknown as PrismaClient,
  };
}

/**
 * Sprint FINAL-2 — Lyrics Generation Traceability.
 */
describe("PrismaLyricsAttemptRecorder.attemptStarted", () => {
  it("opens the lead's first attempt as STARTED, numbered 1, naming the model", async () => {
    const { client, create } = fakeClient({ maxAttemptNumber: null });

    const handle = await new PrismaLyricsAttemptRecorder(client).attemptStarted({
      leadId: LEAD_ID,
      providerModel: "claude-sonnet-5",
    });

    expect(handle).toEqual({ id: "attempt-row-1" });
    expect(create).toHaveBeenCalledWith({
      data: {
        leadId: LEAD_ID,
        attemptNumber: 1,
        result: "STARTED",
        providerModel: "claude-sonnet-5",
      },
      select: { id: true },
    });
  });

  it("continues the lead's numbering across requests instead of restarting at 1", async () => {
    // A lead's second functional attempt is a separate HTTP request, so the
    // number cannot be counted in memory: restarting at 1 would collide with
    // the row the first request already wrote.
    const { client, create, aggregate } = fakeClient({ maxAttemptNumber: 3 });

    await new PrismaLyricsAttemptRecorder(client).attemptStarted({
      leadId: LEAD_ID,
      providerModel: "claude-sonnet-5",
    });

    expect(aggregate).toHaveBeenCalledWith({
      where: { leadId: LEAD_ID },
      _max: { attemptNumber: true },
    });
    expect(create.mock.calls[0][0].data.attemptNumber).toBe(4);
  });

  it("raises a DatabaseError the caller can swallow, never a raw Prisma error", async () => {
    const { client, create } = fakeClient();
    create.mockRejectedValue(new Error("unique constraint violated"));

    await expect(
      new PrismaLyricsAttemptRecorder(client).attemptStarted({
        leadId: LEAD_ID,
        providerModel: "claude-sonnet-5",
      }),
    ).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe("PrismaLyricsAttemptRecorder.attemptFinished", () => {
  it("closes the row it opened, stamping the outcome and the completion time", async () => {
    const { client, update } = fakeClient();

    await new PrismaLyricsAttemptRecorder(client).attemptFinished(
      { id: "attempt-row-1" },
      { result: "FAILED", errorCode: "CLAUDE_OUTPUT_TOO_LONG", failureReason: "too long" },
    );

    const [args] = update.mock.calls[0];
    expect(args.where).toEqual({ id: "attempt-row-1" });
    expect(args.data).toMatchObject({
      result: "FAILED",
      errorCode: "CLAUDE_OUTPUT_TOO_LONG",
      failureReason: "too long",
    });
    expect(args.data.completedAt).toBeInstanceOf(Date);
  });

  it("writes no error code for a successful attempt", async () => {
    const { client, update } = fakeClient();

    await new PrismaLyricsAttemptRecorder(client).attemptFinished(
      { id: "attempt-row-1" },
      { result: "SUCCESS", errorCode: null, failureReason: null },
    );

    expect(update.mock.calls[0][0].data).toMatchObject({
      result: "SUCCESS",
      errorCode: null,
      failureReason: null,
    });
  });

  it("never updates anything but the row it was handed — an attempt is never reassigned", async () => {
    const { client, update } = fakeClient();

    await new PrismaLyricsAttemptRecorder(client).attemptFinished(
      { id: "attempt-row-1" },
      { result: "SUCCESS", errorCode: null, failureReason: null },
    );

    const [args] = update.mock.calls[0];
    expect(Object.keys(args.data).sort()).toEqual([
      "completedAt",
      "errorCode",
      "failureReason",
      "result",
    ]);
    expect(args.data).not.toHaveProperty("attemptNumber");
    expect(args.data).not.toHaveProperty("leadId");
  });

  it("raises a DatabaseError the caller can swallow when the update fails", async () => {
    const { client, update } = fakeClient();
    update.mockRejectedValue(new Error("connection reset"));

    await expect(
      new PrismaLyricsAttemptRecorder(client).attemptFinished(
        { id: "attempt-row-1" },
        { result: "SUCCESS", errorCode: null, failureReason: null },
      ),
    ).rejects.toBeInstanceOf(DatabaseError);
  });
});
