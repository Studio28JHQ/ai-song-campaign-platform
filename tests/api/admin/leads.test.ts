import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSearch = vi.fn();

vi.mock("@/infrastructure/persistence/prisma/admin/PrismaAdminLeadSearchGate", () => ({
  PrismaAdminLeadSearchGate: vi.fn().mockImplementation(function PrismaAdminLeadSearchGate() {
    return { search: mockSearch };
  }),
}));

const { GET } = await import("../../../app/api/admin/leads/route");

function getRequest(query: string): Request {
  return new Request(`http://localhost/api/admin/leads${query}`);
}

describe("GET /api/admin/leads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch.mockResolvedValue({ items: [], total: 0 });
  });

  it("searches with default pagination when no params are given", async () => {
    const response = await GET(getRequest(""));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(mockSearch).toHaveBeenCalledWith({
      query: undefined,
      page: 1,
      pageSize: 20,
      sortBy: undefined,
      sortDirection: undefined,
    });
  });

  it("passes the query, page, pageSize, and sort params through", async () => {
    mockSearch.mockResolvedValue({
      items: [
        {
          id: "lead-1",
          createdAt: new Date("2026-01-01"),
          parentName: "Jane Doe",
          babyName: "Baby Doe",
          email: "jane@example.com",
          phone: null,
          songStatus: "COMPLETED",
          emailSent: true,
        },
      ],
      total: 1,
    });

    const response = await GET(
      getRequest("?q=jane&page=2&pageSize=10&sortBy=parentName&sortDirection=asc"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(mockSearch).toHaveBeenCalledWith({
      query: "jane",
      page: 2,
      pageSize: 10,
      sortBy: "parentName",
      sortDirection: "asc",
    });
  });

  it("returns 400 for an invalid sortBy value", async () => {
    const response = await GET(getRequest("?sortBy=notAColumn"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
    expect(mockSearch).not.toHaveBeenCalled();
  });
});
