import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Social Sharing — the public share page, its Open Graph tags, and the
 * audio route behind the player.
 *
 * The thing under test is an access boundary: this is the only place in
 * the application that answers an unauthenticated caller holding nothing
 * but a token, so the tests are mostly about what does *not* come back.
 */

const mockFindShareable = vi.fn();
const mockResolve = vi.fn();
const mockNotFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/infrastructure/persistence/prisma/song/PrismaPublicSongShareGate", () => ({
  PrismaPublicSongShareGate: vi.fn().mockImplementation(function PrismaPublicSongShareGate() {
    return { findShareableByToken: mockFindShareable };
  }),
}));

vi.mock("@/infrastructure/storage/R2AudioUrlResolver", () => ({
  R2AudioUrlResolver: vi.fn().mockImplementation(function R2AudioUrlResolver() {
    return { resolve: mockResolve };
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mockNotFound }));

const { GET } = await import("../../../app/song/share/[shareToken]/audio/route");
const { generateMetadata, default: SongSharePage } =
  await import("../../../app/song/share/[shareToken]/page");

const TOKEN = "a".repeat(64);
const SIGNED_URL =
  "https://acct.r2.cloudflarestorage.com/bucket/songs/x.mp3?X-Amz-Credential=AKIAKEYID%2F20260930&X-Amz-Signature=deadbeef";

const SHAREABLE = {
  babyName: "Zara",
  duration: 60,
  audioStorageKey: "songs/lead-1.mp3",
};

function params(shareToken = TOKEN) {
  return { params: Promise.resolve({ shareToken }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindShareable.mockResolvedValue(SHAREABLE);
  mockResolve.mockResolvedValue(SIGNED_URL);
  mockNotFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

describe("GET /song/share/[shareToken]/audio", () => {
  it("redirects to a freshly signed, expiring URL", async () => {
    const response = await GET(new Request("http://localhost/x"), params());

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(SIGNED_URL);
    expect(mockResolve).toHaveBeenCalledWith("songs/lead-1.mp3");
  });

  it("never caches the redirect, since the target expires", async () => {
    const response = await GET(new Request("http://localhost/x"), params());

    expect(response.headers.get("cache-control")).toBe("no-store");
    // 302, not a permanent redirect.
    expect(response.status).not.toBe(301);
    expect(response.status).not.toBe(308);
  });

  it("requires no session — the token is the whole credential", async () => {
    // The request carries no cookie at all.
    const response = await GET(new Request("http://localhost/x"), params());

    expect(response.status).toBe(302);
  });

  it.each([
    ["an unknown token", null],
    ["a revoked token", null],
  ])("answers 404 for %s, revealing nothing", async (_label, gateResult) => {
    mockFindShareable.mockResolvedValue(gateResult);

    const response = await GET(new Request("http://localhost/x"), params());

    expect(response.status).toBe(404);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("answers 404 without leaking the reason or the storage key", async () => {
    mockFindShareable.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/x"), params());
    const body = await response.json();

    expect(body).toEqual({ error: "not_found" });
    expect(JSON.stringify(body)).not.toContain("songs/");
  });

  it("answers 500 generically when storage fails, without exposing the cause", async () => {
    mockResolve.mockRejectedValue(new Error("r2 credentials rejected"));

    const response = await GET(new Request("http://localhost/x"), params());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("credentials");
  });
});

describe("the public share page", () => {
  it("renders for a valid token", async () => {
    await expect(SongSharePage(params())).resolves.toBeTruthy();
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("404s when the song is not shareable", async () => {
    mockFindShareable.mockResolvedValue(null);

    await expect(SongSharePage(params())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalled();
  });

  it("asks the gate for the token from the URL and nothing else", async () => {
    await SongSharePage(params("b".repeat(64)));

    expect(mockFindShareable).toHaveBeenCalledWith("b".repeat(64));
  });

  it("never resolves a signed audio URL while rendering the page", async () => {
    // The signed URL must exist only inside the audio redirect, never in
    // the HTML a stranger can view the source of.
    await SongSharePage(params());

    expect(mockResolve).not.toHaveBeenCalled();
  });
});

describe("the public page's Open Graph metadata", () => {
  it("names the child and points at this song's own URL", async () => {
    const metadata = await generateMetadata(params());

    expect(metadata.title).toBe("Una canción personalizada para Zara");
    expect(metadata.openGraph?.description).toBeTruthy();
    expect(String((metadata.openGraph as { url?: unknown }).url)).toContain(`/song/share/${TOKEN}`);
    expect((metadata.openGraph as { type?: string }).type).toBe("website");
  });

  it("uses an absolute, public image so WhatsApp and Facebook can fetch it", async () => {
    const metadata = await generateMetadata(params());
    const images = (metadata.openGraph as { images?: Array<{ url: string }> }).images ?? [];

    expect(images).toHaveLength(1);
    expect(images[0].url).toMatch(/^https?:\/\//);
    expect(images[0].url).toContain("/campaign/banners/banner-campaign.jpg");
  });

  it("sets a large Twitter card", async () => {
    const metadata = await generateMetadata(params());

    expect((metadata.twitter as { card?: string }).card).toBe("summary_large_image");
    expect((metadata.twitter as { title?: string }).title).toContain("Zara");
  });

  it("keeps the page out of search engines while staying scrapeable by social networks", async () => {
    // Open Graph tags are read directly by the scrapers; `noindex` only
    // stops the link becoming a searchable directory of babies' names.
    const metadata = await generateMetadata(params());

    expect((metadata.robots as { index?: boolean }).index).toBe(false);
  });

  it("gives an unknown token a neutral title and no song metadata", async () => {
    mockFindShareable.mockResolvedValue(null);

    const metadata = await generateMetadata(params());

    expect(metadata.title).toBe("Canción no disponible");
    expect(metadata.openGraph).toBeUndefined();
  });

  it("exposes nothing private in the metadata", async () => {
    const metadata = await generateMetadata(params());
    const serialised = JSON.stringify(metadata);

    expect(serialised).not.toContain("songs/lead-1.mp3");
    expect(serialised).not.toContain("lead-1");
    expect(serialised).not.toContain("@");
    expect(serialised).not.toContain("X-Amz");
  });
});
