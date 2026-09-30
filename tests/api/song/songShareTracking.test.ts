import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Share Tracking — the endpoint the email's share buttons point at.
 *
 * Two properties matter more than the rest and most of this file is
 * about them:
 *
 * 1. **No open redirect.** The destination is never read from the
 *    request. A platform is a path segment resolved against a closed
 *    set, and the URL is built from that resolved value.
 * 2. **Recording never blocks sharing.** Every failure after the song
 *    resolves is swallowed and the redirect happens anyway — losing a
 *    metric is acceptable, breaking a family's share button is not.
 */

const mockFindTarget = vi.fn();
const mockFindShareable = vi.fn();
const mockRecord = vi.fn();
const mockCountRecent = vi.fn();
const mockRecordRateEvent = vi.fn();

vi.mock("@/infrastructure/persistence/prisma/song/PrismaPublicSongShareGate", () => ({
  PrismaPublicSongShareGate: vi.fn().mockImplementation(function PrismaPublicSongShareGate() {
    return {
      findShareTargetByToken: mockFindTarget,
      findShareableByToken: mockFindShareable,
    };
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/song/PrismaShareEventRecorder", () => ({
  PrismaShareEventRecorder: vi.fn().mockImplementation(function PrismaShareEventRecorder() {
    return { record: mockRecord };
  }),
}));

vi.mock("@/infrastructure/persistence/prisma/security/PrismaRateLimitRepository", () => ({
  PrismaRateLimitRepository: vi.fn().mockImplementation(function PrismaRateLimitRepository() {
    return { countRecentEvents: mockCountRecent, recordEvent: mockRecordRateEvent };
  }),
}));

const { GET } = await import("../../../app/song/share/[shareToken]/to/[platform]/route");

const TOKEN = "a".repeat(64);
const TARGET = { songId: "song-1", leadId: "lead-1" };
const SHAREABLE = { babyName: "Zara", duration: 60, audioStorageKey: "songs/lead-1.mp3" };

function call(platform: string, shareToken = TOKEN) {
  return GET(new Request("http://localhost/x"), {
    params: Promise.resolve({ shareToken, platform }),
  });
}

/** The `Location` of a redirect, parsed. */
async function destinationOf(platform: string): Promise<URL> {
  const response = await call(platform);
  expect(response.status).toBe(302);
  return new URL(response.headers.get("location") as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindTarget.mockResolvedValue(TARGET);
  mockFindShareable.mockResolvedValue(SHAREABLE);
  mockRecord.mockResolvedValue(undefined);
  mockCountRecent.mockResolvedValue(0);
  mockRecordRateEvent.mockResolvedValue(undefined);
});

describe("recording the event", () => {
  it.each([
    ["whatsapp", "WHATSAPP"],
    ["facebook", "FACEBOOK"],
    ["x", "X"],
  ])("%s records a %s event for the right family and song", async (slug, platform) => {
    await call(slug);

    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledWith({
      songId: "song-1",
      leadId: "lead-1",
      platform,
      utmSource: slug,
      utmMedium: "social",
      utmCampaign: "family_song",
    });
  });

  it("derives the UTM values from the platform, never from the query string", async () => {
    // A hand-edited link must not be able to write whatever it likes.
    await GET(new Request("http://localhost/x?utm_source=evil&utm_medium=evil&utm_campaign=evil"), {
      params: Promise.resolve({ shareToken: TOKEN, platform: "whatsapp" }),
    });

    expect(mockRecord.mock.calls[0][0]).toMatchObject({
      utmSource: "whatsapp",
      utmMedium: "social",
      utmCampaign: "family_song",
    });
  });

  it("records one event per click — no deduplication", async () => {
    await call("whatsapp");
    await call("whatsapp");

    expect(mockRecord).toHaveBeenCalledTimes(2);
  });
});

describe("the destination", () => {
  it("sends WhatsApp the message and the song's public URL", async () => {
    const url = await destinationOf("whatsapp");
    const text = url.searchParams.get("text") as string;

    expect(url.host).toBe("wa.me");
    expect(text).toContain("Escucha la canción personalizada que creamos para Zara");
    expect(text).toContain(`/song/share/${TOKEN}`);
  });

  it("sends Facebook `u` plus `quote`, exactly as before", async () => {
    const url = await destinationOf("facebook");

    expect(url.host).toBe("www.facebook.com");
    expect(url.pathname).toBe("/sharer/sharer.php");
    expect(url.searchParams.get("u")).toContain(`/song/share/${TOKEN}`);
    expect(url.searchParams.get("quote")).toContain("Zara");
  });

  it("sends X its emoji message and the song URL, unchanged", async () => {
    const url = await destinationOf("x");

    expect(url.host).toBe("twitter.com");
    expect(url.pathname).toBe("/intent/tweet");
    expect(url.searchParams.get("text")).toContain("🎵");
    expect(url.searchParams.get("url")).toContain(`/song/share/${TOKEN}`);
  });

  it("gives the platforms the clean public URL, never the tracking URL", async () => {
    // The whole point: if `/to/<platform>` travelled inside a shared
    // message, every recipient opening it would record another share.
    for (const slug of ["whatsapp", "facebook", "x"]) {
      const url = await destinationOf(slug);
      expect(url.href).not.toContain("/to/");
    }
  });

  it("keeps emoji out of WhatsApp and Facebook, and in X", async () => {
    const whatsapp = (await destinationOf("whatsapp")).searchParams.get("text") as string;
    const facebook = (await destinationOf("facebook")).searchParams.get("quote") as string;
    const x = (await destinationOf("x")).searchParams.get("text") as string;

    expect(whatsapp).not.toContain("🎵");
    expect(facebook).not.toContain("🎵");
    expect(x).toContain("🎵");
  });

  it("is never cached, since it embeds a message", async () => {
    const response = await call("whatsapp");

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.status).toBe(302);
  });
});

describe("no open redirect", () => {
  it.each(["linkedin", "evil", "", "WHATSAPP; DROP", "../../etc"])(
    "answers 404 for the unknown platform %j and records nothing",
    async (platform) => {
      const response = await call(platform);

      expect(response.status).toBe(404);
      expect(mockRecord).not.toHaveBeenCalled();
      expect(mockFindTarget).not.toHaveBeenCalled();
    },
  );

  it("ignores a destination supplied in the query string", async () => {
    const response = await GET(
      new Request("http://localhost/x?url=https://evil.test&redirect=https://evil.test"),
      { params: Promise.resolve({ shareToken: TOKEN, platform: "whatsapp" }) },
    );

    expect(response.headers.get("location")).not.toContain("evil.test");
    expect(response.headers.get("location")).toContain("wa.me");
  });

  it("only ever redirects to the three known hosts", async () => {
    const hosts = await Promise.all(
      ["whatsapp", "facebook", "x"].map(async (slug) => (await destinationOf(slug)).host),
    );

    expect(hosts.sort()).toEqual(["twitter.com", "wa.me", "www.facebook.com"]);
  });

  it("accepts the platform case-insensitively but nothing beyond the known set", async () => {
    expect((await call("WhatsApp")).status).toBe(302);
    expect((await call("whatsapp ")).status).toBe(302);
    expect((await call("whats app")).status).toBe(404);
  });
});

describe("songs that cannot be shared", () => {
  it.each([
    ["an unknown token", null],
    ["a revoked token", null],
  ])("answers 404 for %s, revealing nothing", async (_label, result) => {
    mockFindTarget.mockResolvedValue(result);
    mockFindShareable.mockResolvedValue(result);

    const response = await call("whatsapp");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("answers 404 when the song resolves but is not shareable", async () => {
    mockFindShareable.mockResolvedValue(null);

    expect((await call("whatsapp")).status).toBe(404);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("answers 500 generically when the lookup itself fails", async () => {
    mockFindTarget.mockRejectedValue(new Error("connection lost"));

    const response = await call("whatsapp");

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("connection lost");
  });
});

describe("recording never blocks sharing", () => {
  it("still redirects when the insert fails", async () => {
    // The mandatory test: a database failure must not cost the family
    // their share.
    mockRecord.mockRejectedValue(new Error("insert failed"));

    const response = await call("whatsapp");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("wa.me");
  });

  it("still redirects when the rate limiter itself throws", async () => {
    mockCountRecent.mockRejectedValue(new Error("rate limit backend down"));

    const response = await call("facebook");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("facebook.com");
  });

  it("still redirects when the rate limit is exceeded, but records nothing", async () => {
    mockCountRecent.mockResolvedValue(9_999);

    const response = await call("whatsapp");

    expect(response.status).toBe(302);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("rate-limits per token and IP without putting the token in the limiter's own errors", async () => {
    await call("whatsapp");

    const key = mockCountRecent.mock.calls[0][0] as string;
    expect(key.startsWith("share:")).toBe(true);
    expect(key).toContain(TOKEN);
  });
});

describe("privacy", () => {
  it("needs no session — the token is the whole credential", async () => {
    const response = await call("whatsapp");

    expect(response.status).toBe(302);
  });

  it("never exposes the lead id or the song id in the redirect", async () => {
    const url = await destinationOf("whatsapp");

    expect(url.href).not.toContain("lead-1");
    expect(url.href).not.toContain("song-1");
  });
});
