import type { OperationalAlertService } from "../services/OperationalAlertService";
import { OPERATIONAL_ALERT_KINDS } from "../contracts/OperationalAlert";
import type { PipelineHealthGate } from "../contracts/PipelineHealthGate";

/**
 * Operational Alerting. How long songs may sit without a single one
 * finishing before this counts as a stalled pipeline.
 *
 * Chosen against the two timings it has to clear. `GenerationDispatcher`
 * reclaims a song stuck `GENERATING` after `GENERATION_TIMEOUT_MINUTES`
 * (30 by default), so a shorter threshold would alert on a queue that was
 * about to heal itself on the next tick. And the scheduled tick is
 * frequent, so by 45 minutes a healthy pipeline has had many chances to
 * complete something.
 */
const STALLED_AFTER_MINUTES = 45;

/**
 * Operational Alerting. The one check that looks for a problem instead of
 * waiting for an exception.
 *
 * Every other detection site in this feature hangs off a thrown error, so
 * they can only ever report a failure that something was already shouting
 * about. This covers the opposite and more dangerous shape: nothing
 * throws, every request answers 200, and songs simply stop coming out.
 * That is what a family experiences as "my song never arrived", and
 * before this it was invisible until somebody looked at the Dashboard.
 *
 * Both conditions are required, and the second is what makes this
 * trustworthy:
 *
 * - **Something is waiting** — at least one song is `QUEUED` or
 *   `GENERATING`, and the oldest has been waiting longer than
 *   `STALLED_AFTER_MINUTES`.
 * - **Nothing is finishing** — no song has reached `COMPLETED` within
 *   that same window.
 *
 * Without the second condition this would fire on a long but perfectly
 * healthy queue, which is exactly how a monitor teaches people to ignore
 * it. A campaign at full throughput keeps `lastCompletedAt` fresh, so a
 * backlog alone is never an alert.
 *
 * Runs on the scheduled pipeline tick, where the cost is one aggregate
 * query per tick and there is no user waiting on the answer.
 */
export class CheckPipelineHealthUseCase {
  constructor(
    private readonly healthGate: PipelineHealthGate,
    private readonly alertService: OperationalAlertService,
  ) {}

  /** `true` when the pipeline looked stalled, whether or not an email went out. */
  async execute(now: Date = new Date()): Promise<boolean> {
    const health = await this.healthGate.getPipelineHealth();

    if (health.pendingCount === 0 || health.oldestPendingAt === null) {
      return false;
    }

    const thresholdMs = STALLED_AFTER_MINUTES * 60_000;
    const waitingMs = now.getTime() - health.oldestPendingAt.getTime();
    if (waitingMs < thresholdMs) {
      return false;
    }

    const completedRecently =
      health.lastCompletedAt !== null &&
      now.getTime() - health.lastCompletedAt.getTime() < thresholdMs;
    if (completedRecently) {
      return false;
    }

    const minutesSinceLastCompletion =
      health.lastCompletedAt === null
        ? null
        : Math.floor((now.getTime() - health.lastCompletedAt.getTime()) / 60_000);

    await this.alertService.raise({
      kind: OPERATIONAL_ALERT_KINDS.songGenerationStalled,
      summary: `Hay ${health.pendingCount} canción(es) en espera y ninguna se ha completado en los últimos ${STALLED_AFTER_MINUTES} minutos.`,
      action:
        "Revisa el saldo y el estado de Mureka, y los logs de /api/internal/pipeline/run. Las canciones en espera no se pierden: el pipeline las retoma en cuanto el proveedor responda.",
      details: {
        cancionesEnEspera: health.pendingCount,
        minutosEsperandoLaMasAntigua: Math.floor(waitingMs / 60_000),
        minutosDesdeLaUltimaCompletada: minutesSinceLastCompletion,
        umbralMinutos: STALLED_AFTER_MINUTES,
      },
    });

    return true;
  }
}
