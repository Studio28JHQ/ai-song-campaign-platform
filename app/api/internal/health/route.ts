import { NextResponse } from "next/server";
import { HealthCheckService } from "@/infrastructure/health/HealthCheckService";
import { getClientIp } from "@/infrastructure/http/getClientIp";
import { verifyInternalSecret } from "@/infrastructure/http/verifyInternalSecret";
import { logger } from "@/shared/logger/logger";

/**
 * GET /api/internal/health — RC-2 Production Hardening: operational
 * diagnostics for the database, Cloudflare R2, Resend, and Mureka, all
 * checked read-only and side-effect-free (see `HealthCheckService`).
 * For operations only — no UI reads this, and it is never reachable
 * without the shared `CRON_SECRET` (see `verifyInternalSecret`), same
 * as `GET /api/internal/pipeline/run`.
 *
 * Responds `200` when every dependency is healthy, `503` when any one
 * of them isn't — so an external uptime monitor can alert on a single
 * status code without parsing the body, while the body itself still
 * reports every dependency individually for a human to diagnose which
 * one is actually down.
 */

const healthCheckService = new HealthCheckService();

export async function GET(request: Request): Promise<NextResponse> {
  if (!verifyInternalSecret(request)) {
    logger.error("Health check: rejected an unauthenticated request", {
      ip: getClientIp(request),
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await healthCheckService.check();
  const allHealthy = Object.values(result).every((service) => service.status === "ok");

  return NextResponse.json(result, { status: allHealthy ? 200 : 503 });
}
