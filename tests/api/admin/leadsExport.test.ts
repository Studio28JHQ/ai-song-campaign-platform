import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockStreamRows = vi.fn();
const mockGetAdminSession = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock("@/infrastructure/persistence/prisma/admin/PrismaAdminLeadExportGate", () => ({
  PrismaAdminLeadExportGate: vi.fn().mockImplementation(function PrismaAdminLeadExportGate() {
    return { streamRows: mockStreamRows };
  }),
}));

vi.mock("@/infrastructure/auth/getAdminSession", () => ({
  getAdminSession: mockGetAdminSession,
}));

vi.mock("@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository", () => ({
  PrismaAuditLogRepository: vi.fn().mockImplementation(function PrismaAuditLogRepository() {
    return { create: mockAuditCreate, findByEntity: vi.fn(), findRecent: vi.fn() };
  }),
}));

const { GET } = await import("../../../app/api/admin/leads/export/route");

function getRequest(query = ""): Request {
  return new Request(`http://localhost/api/admin/leads/export${query}`);
}

async function readBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

function fakeRow(overrides: Record<string, unknown> = {}) {
  return {
    parentName: "Jane Doe",
    babyName: "Baby Doe",
    email: "jane@example.com",
    phone: "+1 555 123 4567",
    babyAge: 6,
    city: "Austin",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    lyricsStatus: "APPROVED",
    songStatus: "COMPLETED",
    emailStatus: "SENT",
    generatedAt: new Date("2026-01-01T01:00:00.000Z"),
    emailedAt: new Date("2026-01-01T01:05:00.000Z"),
    ...overrides,
  };
}

describe("GET /api/admin/leads/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminSession.mockResolvedValue({ adminId: "admin-1", email: "admin@example.com" });
    mockAuditCreate.mockImplementation(async (entry: unknown) => entry);
  });

  it("returns 401 and never starts the stream when there is no active session", async () => {
    mockGetAdminSession.mockResolvedValue(null);

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("unauthorized");
    expect(mockStreamRows).not.toHaveBeenCalled();
  });

  it("writes an export_leads audit entry attributed to the acting admin before streaming", async () => {
    mockStreamRows.mockImplementation(async function* () {
      yield [fakeRow()];
    });

    await GET(getRequest("?q=jane&songStatus=FAILED&emailStatus=NOT_SENT&city=Austin"));

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const [entry] = mockAuditCreate.mock.calls[0];
    expect(entry.adminId).toBe("admin-1");
    expect(entry.action).toBe("export_leads");
    expect(entry.entity).toBe("Lead");
    expect(entry.metadata).toMatchObject({
      query: "jane",
      songStatus: "FAILED",
      emailStatus: "NOT_SENT",
      city: "Austin",
    });
  });

  it("escapes a leading =, +, -, or @ so the cell can never open as a formula (CSV injection)", async () => {
    mockStreamRows.mockImplementation(async function* () {
      yield [
        fakeRow({ parentName: "=cmd|'/c calc'!A1" }),
        fakeRow({ babyName: "+1+1", email: "b@example.com" }),
        fakeRow({ babyName: "-1-1", email: "c@example.com" }),
        fakeRow({ babyName: "@SUM(1+1)", email: "d@example.com" }),
      ];
    });

    const response = await GET(getRequest());
    const body = await readBody(response);

    expect(body).toContain("'=cmd|'/c calc'!A1");
    expect(body).toContain("'+1+1");
    expect(body).toContain("'-1-1");
    expect(body).toContain("'@SUM(1+1)");
  });

  it("escapes a formula-triggering city value the same way as every other cell", async () => {
    mockStreamRows.mockImplementation(async function* () {
      yield [fakeRow({ city: "=cmd|'/c calc'!A1" })];
    });

    const response = await GET(getRequest());
    const body = await readBody(response);

    expect(body).toContain("'=cmd|'/c calc'!A1");
  });

  it("streams a CSV with the header row and one line per lead", async () => {
    mockStreamRows.mockImplementation(async function* () {
      yield [fakeRow()];
    });

    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain("attachment");

    const body = await readBody(response);
    const lines = body.trim().split("\n");

    expect(lines[0]).toBe(
      "Lead,Baby,Email,Phone,Baby Age,City,Created Date,Lyrics Status,Song Status,Email Status,Generation Date,Delivery Date",
    );
    expect(lines[1]).toContain("Jane Doe");
    expect(lines[1]).toContain("jane@example.com");
    expect(lines[1]).toContain("COMPLETED");
    expect(lines[1]).toContain("SENT");
    expect(lines[1]).toContain("6");
    expect(lines[1]).toContain("Austin");
  });

  it("includes Baby Age and City as empty cells when null, appended right after Phone", async () => {
    mockStreamRows.mockImplementation(async function* () {
      yield [fakeRow({ babyAge: null, city: null })];
    });

    const response = await GET(getRequest());
    const body = await readBody(response);
    const lines = body.trim().split("\n");
    const cells = lines[1].split(",");

    // Column order: Lead(0), Baby(1), Email(2), Phone(3), Baby Age(4), City(5), ...
    expect(cells[4]).toBe("");
    expect(cells[5]).toBe("");
  });

  it("streams multiple batches as they arrive, without buffering them all first", async () => {
    mockStreamRows.mockImplementation(async function* () {
      yield [fakeRow({ email: "a@example.com" })];
      yield [fakeRow({ email: "b@example.com" })];
    });

    const response = await GET(getRequest());
    const body = await readBody(response);
    const lines = body.trim().split("\n");

    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toContain("a@example.com");
    expect(lines[2]).toContain("b@example.com");
  });

  it("escapes commas and quotes in a field", async () => {
    mockStreamRows.mockImplementation(async function* () {
      yield [fakeRow({ parentName: 'Jane "JJ" Doe, Jr.' })];
    });

    const response = await GET(getRequest());
    const body = await readBody(response);

    expect(body).toContain('"Jane ""JJ"" Doe, Jr."');
  });

  it("passes filters through to the export gate", async () => {
    mockStreamRows.mockImplementation(async function* () {
      yield [];
    });

    await GET(getRequest("?q=jane&songStatus=FAILED&emailStatus=NOT_SENT&city=Austin"));

    expect(mockStreamRows).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "jane",
        songStatus: "FAILED",
        emailStatus: "NOT_SENT",
        city: "Austin",
      }),
      expect.any(Number),
    );
  });

  it("returns 400 for an invalid songStatus filter before starting the stream", async () => {
    const response = await GET(getRequest("?songStatus=NOT_A_STATUS"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
    expect(mockStreamRows).not.toHaveBeenCalled();
  });

  it("returns 400 for a date range where dateFrom is after dateTo, before starting the stream", async () => {
    const response = await GET(getRequest("?dateFrom=2026-02-01&dateTo=2026-01-01"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
    expect(mockStreamRows).not.toHaveBeenCalled();
  });

  it("ends the stream gracefully (without throwing) on a mid-export failure", async () => {
    mockStreamRows.mockImplementation(async function* () {
      yield [fakeRow()];
      throw new Error("connection lost mid-export");
    });

    const response = await GET(getRequest());
    expect(response.status).toBe(200);

    const body = await readBody(response);
    expect(body).toContain("Jane Doe");
    expect(body).not.toContain("connection lost");
  });
});
