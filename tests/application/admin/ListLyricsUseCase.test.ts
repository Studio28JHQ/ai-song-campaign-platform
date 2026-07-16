import { describe, expect, it, vi } from "vitest";
import { ListLyricsUseCase } from "@/application/admin/use-cases/ListLyricsUseCase";
import type { AdminLyricsListGate } from "@/application/admin/contracts/AdminLyricsListGate";

describe("ListLyricsUseCase", () => {
  it("returns the gate's rows unchanged, capped at 200", async () => {
    const gate: AdminLyricsListGate = { list: vi.fn().mockResolvedValue([]) };
    const useCase = new ListLyricsUseCase(gate);

    const result = await useCase.execute();

    expect(gate.list).toHaveBeenCalledWith(200);
    expect(result).toEqual({ items: [] });
  });
});
