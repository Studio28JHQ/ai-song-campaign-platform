import { describe, expect, it, vi } from "vitest";
import { OPERATIONAL_ALERT_KINDS } from "@/application/alerting/contracts/OperationalAlert";
import type {
  PipelineHealthGate,
  PipelineHealthSnapshot,
} from "@/application/alerting/contracts/PipelineHealthGate";
import type { OperationalAlertService } from "@/application/alerting/services/OperationalAlertService";
import { CheckPipelineHealthUseCase } from "@/application/alerting/use-cases/CheckPipelineHealthUseCase";

/**
 * Operational Alerting. The stall detector's whole value is that it fires
 * on the one case nobody else notices and stays quiet on every case that
 * merely looks like it — a busy queue above all. These tests pin both
 * sides, because a monitor that cries wolf gets muted and then the real
 * incident goes unseen too.
 */

const NOW = new Date("2026-11-22T15:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

function gate(snapshot: PipelineHealthSnapshot): PipelineHealthGate {
  return { getPipelineHealth: vi.fn().mockResolvedValue(snapshot) };
}

function alertService() {
  return { raise: vi.fn().mockResolvedValue(true) } as unknown as OperationalAlertService & {
    raise: ReturnType<typeof vi.fn>;
  };
}

describe("CheckPipelineHealthUseCase", () => {
  it("alerts when songs are waiting and nothing has completed inside the window", async () => {
    const alerts = alertService();
    const useCase = new CheckPipelineHealthUseCase(
      gate({
        pendingCount: 7,
        oldestPendingAt: minutesAgo(90),
        lastCompletedAt: minutesAgo(80),
      }),
      alerts,
    );

    await expect(useCase.execute(NOW)).resolves.toBe(true);
    expect(alerts.raise).toHaveBeenCalledTimes(1);
    expect(alerts.raise.mock.calls[0][0]).toMatchObject({
      kind: OPERATIONAL_ALERT_KINDS.songGenerationStalled,
      details: { cancionesEnEspera: 7, minutosEsperandoLaMasAntigua: 90 },
    });
  });

  it("stays quiet on a long but moving queue — the case that would make this noise", async () => {
    const alerts = alertService();
    const useCase = new CheckPipelineHealthUseCase(
      gate({
        // A backlog hours deep, but songs are still coming out.
        pendingCount: 120,
        oldestPendingAt: minutesAgo(600),
        lastCompletedAt: minutesAgo(2),
      }),
      alerts,
    );

    await expect(useCase.execute(NOW)).resolves.toBe(false);
    expect(alerts.raise).not.toHaveBeenCalled();
  });

  it("stays quiet when nothing is pending, however long since the last song", async () => {
    const alerts = alertService();
    const useCase = new CheckPipelineHealthUseCase(
      gate({ pendingCount: 0, oldestPendingAt: null, lastCompletedAt: minutesAgo(5000) }),
      alerts,
    );

    await expect(useCase.execute(NOW)).resolves.toBe(false);
    expect(alerts.raise).not.toHaveBeenCalled();
  });

  it("stays quiet while a pending song is still inside the grace window", async () => {
    const alerts = alertService();
    const useCase = new CheckPipelineHealthUseCase(
      // 44 minutes: one minute short of the threshold, and still inside
      // the window the dispatcher's own stuck-song reclaim needs.
      gate({ pendingCount: 1, oldestPendingAt: minutesAgo(44), lastCompletedAt: minutesAgo(44) }),
      alerts,
    );

    await expect(useCase.execute(NOW)).resolves.toBe(false);
    expect(alerts.raise).not.toHaveBeenCalled();
  });

  it("alerts on a campaign that has never completed a song but has one waiting", async () => {
    const alerts = alertService();
    const useCase = new CheckPipelineHealthUseCase(
      gate({ pendingCount: 1, oldestPendingAt: minutesAgo(120), lastCompletedAt: null }),
      alerts,
    );

    await expect(useCase.execute(NOW)).resolves.toBe(true);
    expect(alerts.raise.mock.calls[0][0].details).toMatchObject({
      minutosDesdeLaUltimaCompletada: null,
    });
  });
});
