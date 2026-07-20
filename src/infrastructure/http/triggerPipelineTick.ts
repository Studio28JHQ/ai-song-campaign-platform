import { appConfig } from "@/config/app";
import { logger } from "@/shared/logger/logger";

/**
 * Fires one authenticated, single-shot call to the internal pipeline
 * endpoint (`GET /api/internal/pipeline/run`) — the single place
 * `GenerationDispatcher`/`GenerationPoller` are ever invoked from (see
 * that route). Every request-triggered call site
 * (`/api/lyrics/approve`, `/api/song/generate`,
 * `/api/admin/songs/[songId]/retry`) uses this instead of instantiating
 * its own dispatcher/poller, so there is exactly one polling
 * implementation, not one per call site.
 *
 * Purely a responsiveness optimization: when a real user request is
 * already in flight, it's worth immediately nudging the queue forward
 * rather than waiting for the next scheduled tick. It must never be
 * relied on for correctness — the only mechanism a song's completion
 * actually depends on is the scheduled GitHub Actions workflow
 * (`.github/workflows/song-pipeline.yml`), which calls this same
 * endpoint on a fixed interval independent of any user traffic. An
 * earlier version of this endpoint had itself call this function again
 * after an in-process delay, self-perpetuating a chain of ticks — that
 * was reverted (see `/api/internal/pipeline/run`'s doc comment) because
 * it depended on the serverless instance surviving past the response,
 * which this app's production execution model doesn't guarantee.
 *
 * `origin` must be the origin that is actually serving the current
 * request (`new URL(request.url).origin` at every call site) — never
 * `appConfig.url`/`NEXT_PUBLIC_APP_URL`. That config value is the
 * stable public domain used for user-facing links (see `buildAppUrl`)
 * and is deliberately never a preview/local URL, so using it here would
 * make a local dev server (or a preview deployment) silently call a
 * *different*, unrelated deployment.
 *
 * Never throws — a failed trigger is logged and otherwise swallowed,
 * matching every other background call site in this codebase (a
 * transient failure here must never surface to, or block, the caller).
 */
export async function triggerPipelineTick(origin: string): Promise<void> {
  try {
    const response = await fetch(new URL("/api/internal/pipeline/run", origin), {
      method: "GET",
      headers: { authorization: `Bearer ${appConfig.internal.cronSecret}` },
    });

    if (!response.ok) {
      logger.error("Pipeline tick trigger returned a non-2xx response", {
        status: response.status,
      });
    }
  } catch (error) {
    logger.error("Pipeline tick trigger failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
