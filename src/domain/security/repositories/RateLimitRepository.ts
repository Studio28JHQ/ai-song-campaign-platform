/**
 * Persistence contract for Sprint 8.2's DB-backed rate limiting.
 * Interface only — no implementation. A concrete adapter (Prisma or
 * otherwise) belongs in `src/infrastructure/`, not here.
 */
export interface RateLimitRepository {
  /** Counts events recorded for `key` at or after `windowStart`. */
  countRecentEvents(key: string, windowStart: Date): Promise<number>;

  /** Records one consumed request for `key`. */
  recordEvent(key: string): Promise<void>;
}
