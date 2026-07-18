import { describe, expect, it, vi } from "vitest";
import { ListRecentActivityUseCase } from "@/application/admin/use-cases/ListRecentActivityUseCase";
import type {
  AdminRecentActivityGate,
  RecentActivityRow,
} from "@/application/admin/contracts/AdminRecentActivityGate";

function row(overrides: Partial<RecentActivityRow> = {}): RecentActivityRow {
  return {
    type: "lead_registered",
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    leadId: "lead-1",
    parentName: "Jane Doe",
    babyName: "Baby Doe",
    ...overrides,
  };
}

describe("ListRecentActivityUseCase", () => {
  it("returns the gate's rows unchanged", async () => {
    const gate: AdminRecentActivityGate = { list: vi.fn().mockResolvedValue([row()]) };
    const useCase = new ListRecentActivityUseCase(gate);

    const result = await useCase.execute();

    expect(result.items).toEqual([row()]);
  });

  it("defaults to a limit of 15 when none is given", async () => {
    const gate: AdminRecentActivityGate = { list: vi.fn().mockResolvedValue([]) };
    const useCase = new ListRecentActivityUseCase(gate);

    await useCase.execute();

    expect(gate.list).toHaveBeenCalledWith(15);
  });

  it("forwards an explicit limit to the gate", async () => {
    const gate: AdminRecentActivityGate = { list: vi.fn().mockResolvedValue([]) };
    const useCase = new ListRecentActivityUseCase(gate);

    await useCase.execute(5);

    expect(gate.list).toHaveBeenCalledWith(5);
  });
});
