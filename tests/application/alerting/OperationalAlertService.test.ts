import { describe, expect, it, vi } from "vitest";
import type { AlertEmailSender } from "@/application/alerting/contracts/AlertEmailSender";
import {
  OPERATIONAL_ALERT_KINDS,
  type OperationalAlert,
  type OperationalAlertKind,
} from "@/application/alerting/contracts/OperationalAlert";
import { OperationalAlertService } from "@/application/alerting/services/OperationalAlertService";
import { RateLimiter } from "@/application/security/services/RateLimiter";
import type { RateLimitRepository } from "@/domain/security/repositories/RateLimitRepository";

/**
 * Operational Alerting. The two properties that decide whether this
 * feature helps or hurts during a real incident: it must not multiply one
 * problem into hundreds of emails, and it must never be the reason a
 * failing request fails worse.
 */

function alert(
  kind: OperationalAlertKind = OPERATIONAL_ALERT_KINDS.lyricsProviderUnavailable,
): OperationalAlert {
  return { kind, summary: "Algo falló.", action: "Revísalo." };
}

/** In-memory `RateLimitRepository` — a sliding window over recorded keys. */
function inMemoryRateLimitRepository(): RateLimitRepository {
  const events: Array<{ key: string; at: Date }> = [];

  return {
    async countRecentEvents(key: string, since: Date): Promise<number> {
      return events.filter((event) => event.key === key && event.at >= since).length;
    },
    async recordEvent(key: string): Promise<void> {
      events.push({ key, at: new Date() });
    },
  } as unknown as RateLimitRepository;
}

function fakeSender(): AlertEmailSender {
  return { sendAlertEmail: vi.fn().mockResolvedValue(undefined) };
}

describe("OperationalAlertService.raise", () => {
  it("emails the first occurrence of a kind", async () => {
    const sender = fakeSender();
    const service = new OperationalAlertService(
      sender,
      new RateLimiter(inMemoryRateLimitRepository()),
    );

    await expect(service.raise(alert())).resolves.toBe(true);
    expect(sender.sendAlertEmail).toHaveBeenCalledTimes(1);
  });

  it("sends one email for a storm of identical failures, not one per failure", async () => {
    const sender = fakeSender();
    const service = new OperationalAlertService(
      sender,
      new RateLimiter(inMemoryRateLimitRepository()),
    );

    // The shape of the 2026-11-21 Claude billing outage: the same failure,
    // over and over, from the same code path.
    const outcomes: boolean[] = [];
    for (let i = 0; i < 50; i += 1) {
      outcomes.push(await service.raise(alert()));
    }

    expect(sender.sendAlertEmail).toHaveBeenCalledTimes(1);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
  });

  it("keeps the kinds independent — one kind's cooldown never silences another", async () => {
    const sender = fakeSender();
    const service = new OperationalAlertService(
      sender,
      new RateLimiter(inMemoryRateLimitRepository()),
    );

    await service.raise(alert(OPERATIONAL_ALERT_KINDS.lyricsProviderCreditExhausted));
    await service.raise(alert(OPERATIONAL_ALERT_KINDS.songGenerationStalled));
    await service.raise(alert(OPERATIONAL_ALERT_KINDS.songPipelineTickFailed));
    // ...and a repeat of the first is still suppressed.
    await service.raise(alert(OPERATIONAL_ALERT_KINDS.lyricsProviderCreditExhausted));

    expect(sender.sendAlertEmail).toHaveBeenCalledTimes(3);
  });

  it("swallows a sending failure — alerting can never break the caller", async () => {
    const sender = {
      sendAlertEmail: vi.fn().mockRejectedValue(new Error("Resend API responded with status 500.")),
    };
    const service = new OperationalAlertService(
      sender,
      new RateLimiter(inMemoryRateLimitRepository()),
    );

    await expect(service.raise(alert())).resolves.toBe(false);
  });

  it("swallows a throttle-store failure too", async () => {
    const sender = fakeSender();
    const brokenRepository = {
      countRecentEvents: vi.fn().mockRejectedValue(new Error("Database request failed (P2022).")),
      recordEvent: vi.fn(),
    } as unknown as RateLimitRepository;
    const service = new OperationalAlertService(sender, new RateLimiter(brokenRepository));

    await expect(service.raise(alert())).resolves.toBe(false);
    expect(sender.sendAlertEmail).not.toHaveBeenCalled();
  });
});
