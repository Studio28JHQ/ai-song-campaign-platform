import { describe, expect, it, vi } from "vitest";
import { ListLyricsUseCase } from "@/application/admin/use-cases/ListLyricsUseCase";
import type { AdminLyricsListGate } from "@/application/admin/contracts/AdminLyricsListGate";

describe("ListLyricsUseCase", () => {
  it("returns the gate's rows and total unchanged", async () => {
    const gate: AdminLyricsListGate = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const useCase = new ListLyricsUseCase(gate);

    const result = await useCase.execute({ page: 1 });

    expect(gate.list).toHaveBeenCalledWith({ page: 1, pageSize: 20, query: undefined });
    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it("forwards pagination and a trimmed query to the gate", async () => {
    const gate: AdminLyricsListGate = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const useCase = new ListLyricsUseCase(gate);

    await useCase.execute({ page: 2, pageSize: 10, query: "  Jane  " });

    expect(gate.list).toHaveBeenCalledWith({ page: 2, pageSize: 10, query: "Jane" });
  });

  it("rejects a non-positive page", async () => {
    const gate: AdminLyricsListGate = { list: vi.fn() };
    const useCase = new ListLyricsUseCase(gate);

    await expect(useCase.execute({ page: 0 })).rejects.toThrow();
    expect(gate.list).not.toHaveBeenCalled();
  });

  it("rejects a pageSize over the maximum", async () => {
    const gate: AdminLyricsListGate = { list: vi.fn() };
    const useCase = new ListLyricsUseCase(gate);

    await expect(useCase.execute({ page: 1, pageSize: 1000 })).rejects.toThrow();
    expect(gate.list).not.toHaveBeenCalled();
  });
});
