import type { RateLimitRepository } from "@/domain/security/repositories/RateLimitRepository";

export interface RateLimitCheckInput {
  /** Opaque scope identifier, e.g. "registration:ip:203.0.113.4". */
  key: string;
  limit: number;
  windowMinutes: number;
}

export interface RateLimitCheckResult {
  allowed: boolean;
}

/**
 * Sliding-window rate limiter (Sprint 8.2 — Abuse Protection). A request
 * within the limit is recorded and allowed; a request at or over the
 * limit is rejected without being recorded, so a blocked caller cannot
 * grow the table by retrying and the limit stays exactly enforced until
 * the window rolls forward. DB-backed only — see `RateLimitRepository`
 * and PROJECT_MANIFEST.md (no Redis/message queue).
 */
export class RateLimiter {
  constructor(private readonly repository: RateLimitRepository) {}

  async consume(input: RateLimitCheckInput): Promise<RateLimitCheckResult> {
    const windowStart = new Date(Date.now() - input.windowMinutes * 60_000);
    const count = await this.repository.countRecentEvents(input.key, windowStart);

    if (count >= input.limit) {
      return { allowed: false };
    }

    await this.repository.recordEvent(input.key);
    return { allowed: true };
  }
}
