import { describe, expect, it, vi } from "vitest";
import { SearchLeadsUseCase } from "@/application/admin/use-cases/SearchLeadsUseCase";
import type { AdminLeadSearchGate } from "@/application/admin/contracts/AdminLeadSearchGate";

function fakeGate(): AdminLeadSearchGate {
  return { search: vi.fn().mockResolvedValue({ items: [], total: 0 }) };
}

describe("SearchLeadsUseCase", () => {
  it("delegates to the search gate with normalized query/pagination", async () => {
    const gate = fakeGate();
    const useCase = new SearchLeadsUseCase(gate);

    await useCase.execute({ query: "  jane  ", page: 2, pageSize: 10 });

    expect(gate.search).toHaveBeenCalledWith({
      query: "jane",
      page: 2,
      pageSize: 10,
      sortBy: undefined,
      sortDirection: undefined,
    });
  });

  it("passes an undefined query when the trimmed query is empty", async () => {
    const gate = fakeGate();
    const useCase = new SearchLeadsUseCase(gate);

    await useCase.execute({ query: "   ", page: 1, pageSize: 20 });

    expect(gate.search).toHaveBeenCalledWith(expect.objectContaining({ query: undefined }));
  });

  it("rejects a non-positive page", async () => {
    const useCase = new SearchLeadsUseCase(fakeGate());
    await expect(useCase.execute({ page: 0, pageSize: 20 })).rejects.toThrow();
  });

  it("rejects a pageSize above the maximum", async () => {
    const useCase = new SearchLeadsUseCase(fakeGate());
    await expect(useCase.execute({ page: 1, pageSize: 1000 })).rejects.toThrow();
  });

  it("passes date range, song status, email status, and city filters through to the gate", async () => {
    const gate = fakeGate();
    const useCase = new SearchLeadsUseCase(gate);
    const dateFrom = new Date("2026-01-01T00:00:00.000Z");
    const dateTo = new Date("2026-01-31T23:59:59.000Z");

    await useCase.execute({
      page: 1,
      pageSize: 20,
      dateFrom,
      dateTo,
      songStatus: "FAILED",
      emailStatus: "NOT_SENT",
      city: "  Austin  ",
    });

    expect(gate.search).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom,
        dateTo,
        songStatus: "FAILED",
        emailStatus: "NOT_SENT",
        city: "Austin",
      }),
    );
  });

  it("rejects a date range where dateFrom is after dateTo", async () => {
    const useCase = new SearchLeadsUseCase(fakeGate());

    await expect(
      useCase.execute({
        page: 1,
        pageSize: 20,
        dateFrom: new Date("2026-02-01T00:00:00.000Z"),
        dateTo: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow();
  });

  it("returns the gate's results alongside the normalized page/pageSize", async () => {
    const gate: AdminLeadSearchGate = {
      search: vi.fn().mockResolvedValue({ items: [{ id: "lead-1" }], total: 1 }),
    };
    const useCase = new SearchLeadsUseCase(gate);

    const result = await useCase.execute({ page: 1, pageSize: 20 });

    expect(result).toEqual({ items: [{ id: "lead-1" }], total: 1, page: 1, pageSize: 20 });
  });
});
