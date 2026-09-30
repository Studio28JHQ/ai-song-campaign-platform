import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Share Tracking — the CSV export.
 *
 * Follows the consents export in shape, so the tests follow its
 * guarantees: an unauthenticated caller gets nothing, every export is
 * audited before a byte is written, and a lead-supplied name can never
 * open as a spreadsheet formula.
 */

const mockGetAdminSession = vi.fn();
const mockStreamAll = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock("@/infrastructure/auth/getAdminSession", () => ({
  getAdminSession: mockGetAdminSession,
}));

vi.mock("@/infrastructure/persistence/prisma/admin/PrismaAdminShareExportGate", () => ({
  PrismaAdminShareExportGate: vi.fn().mockImplementation(function PrismaAdminShareExportGate() {
    return { streamAll: mockStreamAll };
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/admin/PrismaAuditLogRepository", () => ({
  PrismaAuditLogRepository: vi.fn().mockImplementation(function PrismaAuditLogRepository() {
    return { create: mockAuditCreate, findByEntity: vi.fn() };
  }),
}));

const { GET } = await import("../../../app/api/admin/shares/export/route");

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    // 2026-09-30 18:42:07 UTC = 13:42:07 in America/Guayaquil (UTC-5).
    createdAt: new Date("2026-09-30T18:42:07.000Z"),
    platform: "WHATSAPP",
    utmSource: "whatsapp",
    utmMedium: "social",
    utmCampaign: "family_song",
    parentName: "Ana Ruiz",
    babyName: "Zara",
    email: "ana@example.test",
    ...overrides,
  };
}

function streamOf(...rows: ReturnType<typeof row>[]) {
  return async function* () {
    yield rows;
  };
}

async function bodyOf(response: Response): Promise<string> {
  return await new Response(response.body).text();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAdminSession.mockResolvedValue({ adminId: "admin-1", email: "admin@example.test" });
  mockStreamAll.mockImplementation(streamOf(row()));
  mockAuditCreate.mockImplementation(async (entry) => entry);
});

describe("GET /api/admin/shares/export", () => {
  it("refuses an unauthenticated caller and exports nothing", async () => {
    mockGetAdminSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockStreamAll).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("audits the export before writing anything", async () => {
    await GET();

    const entry = mockAuditCreate.mock.calls[0][0].toSnapshot();
    expect(entry.adminId).toBe("admin-1");
    expect(entry.action).toBe("export_shares");
    expect(entry.entity).toBe("ShareEvent");
  });

  it("writes the expected header", async () => {
    const body = await bodyOf(await GET());

    expect(body.split("\n")[0]).toBe(
      "Fecha,Hora,Familia,Bebé,Email,Plataforma,utm_source,utm_medium,utm_campaign",
    );
  });

  it("writes a row with the campaign's timezone, not UTC", async () => {
    const body = await bodyOf(await GET());
    const [, dataRow] = body.split("\n");

    // 18:42 UTC is 13:42 in America/Guayaquil.
    expect(dataRow).toContain("2026-09-30,13:42:07");
    expect(dataRow).not.toContain("18:42:07");
    expect(dataRow).toContain("Ana Ruiz");
    expect(dataRow).toContain("Zara");
    expect(dataRow).toContain("WhatsApp");
    expect(dataRow).toContain("whatsapp,social,family_song");
  });

  it("labels each platform readably", async () => {
    mockStreamAll.mockImplementation(
      streamOf(row({ platform: "FACEBOOK" }), row({ platform: "X" })),
    );

    const body = await bodyOf(await GET());

    expect(body).toContain("Facebook");
    expect(body).toMatch(/,X,/);
  });

  it("escapes a name that would otherwise open as a spreadsheet formula", async () => {
    mockStreamAll.mockImplementation(streamOf(row({ parentName: "=SUM(A1:A9)" })));

    const body = await bodyOf(await GET());

    expect(body).toContain("'=SUM(A1:A9)");
  });

  it("serves a downloadable CSV", async () => {
    const response = await GET();

    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain("shares-export.csv");
  });

  it("ends the stream cleanly when the database fails mid-export", async () => {
    mockStreamAll.mockImplementation(async function* () {
      yield [row()];
      throw new Error("connection lost");
    });

    const body = await bodyOf(await GET());

    // The header and the row that made it are still valid CSV, and the
    // cause never reaches the file.
    expect(body).toContain("Ana Ruiz");
    expect(body).not.toContain("connection lost");
  });
});
