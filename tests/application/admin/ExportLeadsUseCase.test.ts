import { describe, expect, it, vi } from "vitest";
import {
  ExportLeadsUseCase,
  EXPORT_BATCH_SIZE,
} from "@/application/admin/use-cases/ExportLeadsUseCase";
import type {
  AdminLeadExportGate,
  AdminLeadExportRow,
} from "@/application/admin/contracts/AdminLeadExportGate";

function fakeRow(overrides: Partial<AdminLeadExportRow> = {}): AdminLeadExportRow {
  return {
    parentName: "Jane Doe",
    babyName: "Baby Doe",
    email: "jane@example.com",
    phone: null,
    babyAge: null,
    city: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    lyricsStatus: "APPROVED",
    songStatus: "COMPLETED",
    emailStatus: "SENT",
    generatedAt: new Date("2026-01-01T01:00:00.000Z"),
    emailedAt: new Date("2026-01-01T01:05:00.000Z"),
    ...overrides,
  };
}

function fakeGate(batches: AdminLeadExportRow[][]): AdminLeadExportGate {
  return {
    streamRows: vi.fn(async function* () {
      for (const batch of batches) yield batch;
    }),
  };
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of iterable) results.push(item);
  return results;
}

describe("ExportLeadsUseCase", () => {
  it("streams every batch the gate yields, unchanged", async () => {
    const gate = fakeGate([[fakeRow()], [fakeRow({ email: "john@example.com" })]]);
    const useCase = new ExportLeadsUseCase(gate);

    const batches = await collect(useCase.execute({}));

    expect(batches).toHaveLength(2);
    expect(batches[1][0].email).toBe("john@example.com");
  });

  it("passes the fixed export batch size to the gate", async () => {
    const gate = fakeGate([]);
    const useCase = new ExportLeadsUseCase(gate);

    await collect(useCase.execute({}));

    expect(gate.streamRows).toHaveBeenCalledWith(expect.anything(), EXPORT_BATCH_SIZE);
  });

  it("normalizes query and city, and passes filters through", async () => {
    const gate = fakeGate([]);
    const useCase = new ExportLeadsUseCase(gate);

    await collect(
      useCase.execute({
        query: "  jane  ",
        city: "  Austin  ",
        songStatus: "FAILED",
        emailStatus: "SENT",
      }),
    );

    expect(gate.streamRows).toHaveBeenCalledWith(
      {
        query: "jane",
        dateFrom: undefined,
        dateTo: undefined,
        songStatus: "FAILED",
        emailStatus: "SENT",
        city: "Austin",
      },
      EXPORT_BATCH_SIZE,
    );
  });

  it("rejects a date range where dateFrom is after dateTo, without ever calling the gate", async () => {
    const gate = fakeGate([]);
    const useCase = new ExportLeadsUseCase(gate);

    const generator = useCase.execute({
      dateFrom: new Date("2026-02-01T00:00:00.000Z"),
      dateTo: new Date("2026-01-01T00:00:00.000Z"),
    });

    await expect(collect(generator)).rejects.toThrow();
    expect(gate.streamRows).not.toHaveBeenCalled();
  });
});
