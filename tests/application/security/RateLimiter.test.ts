import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "@/application/security/services/RateLimiter";
import type { RateLimitRepository } from "@/domain/security/repositories/RateLimitRepository";

class InMemoryRateLimitRepository implements RateLimitRepository {
  private eventsByKey = new Map<string, Date[]>();

  async countRecentEvents(key: string, windowStart: Date): Promise<number> {
    const events = this.eventsByKey.get(key) ?? [];
    return events.filter((event) => event.getTime() >= windowStart.getTime()).length;
  }

  async recordEvent(key: string): Promise<void> {
    const events = this.eventsByKey.get(key) ?? [];
    events.push(new Date());
    this.eventsByKey.set(key, events);
  }
}

describe("RateLimiter.consume", () => {
  it("allows and records a request under the limit", async () => {
    const repository = new InMemoryRateLimitRepository();
    const limiter = new RateLimiter(repository);

    const result = await limiter.consume({ key: "test:ip:1.2.3.4", limit: 3, windowMinutes: 60 });

    expect(result.allowed).toBe(true);
    expect(await repository.countRecentEvents("test:ip:1.2.3.4", new Date(0))).toBe(1);
  });

  it("blocks once the limit is reached (rate limit reached)", async () => {
    const repository = new InMemoryRateLimitRepository();
    const limiter = new RateLimiter(repository);
    const input = { key: "test:ip:1.2.3.4", limit: 2, windowMinutes: 60 };

    expect((await limiter.consume(input)).allowed).toBe(true);
    expect((await limiter.consume(input)).allowed).toBe(true);
    const third = await limiter.consume(input);

    expect(third.allowed).toBe(false);
  });

  it("does not record an event for a blocked request, so the count never exceeds the limit", async () => {
    const repository = new InMemoryRateLimitRepository();
    const limiter = new RateLimiter(repository);
    const input = { key: "test:ip:1.2.3.4", limit: 1, windowMinutes: 60 };

    await limiter.consume(input);
    await limiter.consume(input);
    await limiter.consume(input);

    expect(await repository.countRecentEvents(input.key, new Date(0))).toBe(1);
  });

  it("queries the repository with a window start derived from windowMinutes", async () => {
    const countRecentEvents = vi.fn().mockResolvedValue(0);
    const repository: RateLimitRepository = {
      countRecentEvents,
      recordEvent: vi.fn().mockResolvedValue(undefined),
    };
    const limiter = new RateLimiter(repository);

    const before = Date.now();
    await limiter.consume({ key: "test:ip:1.2.3.4", limit: 5, windowMinutes: 30 });
    const after = Date.now();

    const [, windowStart] = countRecentEvents.mock.calls[0] as [string, Date];
    const expectedEarliest = before - 30 * 60_000;
    const expectedLatest = after - 30 * 60_000;
    expect(windowStart.getTime()).toBeGreaterThanOrEqual(expectedEarliest);
    expect(windowStart.getTime()).toBeLessThanOrEqual(expectedLatest);
  });
});

describe("RateLimiter.consume — window reset", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests again once the window rolls past the earlier events", async () => {
    const repository = new InMemoryRateLimitRepository();
    const limiter = new RateLimiter(repository);
    const input = { key: "test:ip:1.2.3.4", limit: 1, windowMinutes: 1 };

    vi.setSystemTime(new Date("2026-07-16T10:00:00.000Z"));
    expect((await limiter.consume(input)).allowed).toBe(true);
    expect((await limiter.consume(input)).allowed).toBe(false);

    // Advance past the 1-minute window — the earlier event falls out of range.
    vi.setSystemTime(new Date("2026-07-16T10:01:01.000Z"));
    expect((await limiter.consume(input)).allowed).toBe(true);
  });
});
