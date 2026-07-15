import { prisma } from "@/infrastructure/persistence/prisma/client";
import { CloudflareR2Storage } from "@/infrastructure/storage/CloudflareR2Storage";
import { ResendClient } from "@/infrastructure/email/ResendClient";
import { MurekaClient } from "@/infrastructure/mureka/MurekaClient";

const R2_HEALTH_CHECK_KEY = "_internal/health-check-probe";

export interface ServiceHealth {
  status: "ok" | "error";
  message?: string;
}

export interface HealthCheckResult {
  database: ServiceHealth;
  r2: ServiceHealth;
  resend: ServiceHealth;
  mureka: ServiceHealth;
}

/**
 * Operational-only diagnostics (RC-2 — Production Hardening) for
 * `GET /api/internal/health` — never called from the generation
 * pipeline itself. Every check is read-only and side-effect-free:
 * `SELECT 1` for the database, `HEAD`-equivalent `exists()` on a fixed,
 * never-written key for R2 (safe even though the key never exists —
 * `CloudflareR2Storage.exists` returns `false` rather than throwing for
 * a missing key), and each provider's own free, read-only diagnostic
 * endpoint for Resend/Mureka — never a real send or a real generation
 * request. Checks run independently and in parallel; one failing never
 * prevents the others from reporting.
 */
export class HealthCheckService {
  constructor(
    private readonly r2Storage: CloudflareR2Storage = new CloudflareR2Storage(),
    private readonly resendClient: ResendClient = new ResendClient(),
    private readonly murekaClient: MurekaClient = new MurekaClient(),
  ) {}

  async check(): Promise<HealthCheckResult> {
    const [database, r2, resend, mureka] = await Promise.all([
      this.checkDatabase(),
      this.checkR2(),
      this.checkResend(),
      this.checkMureka(),
    ]);

    return { database, r2, resend, mureka };
  }

  private async checkDatabase(): Promise<ServiceHealth> {
    return HealthCheckService.toServiceHealth(async () => {
      await prisma.$queryRaw`SELECT 1`;
    });
  }

  private async checkR2(): Promise<ServiceHealth> {
    return HealthCheckService.toServiceHealth(async () => {
      await this.r2Storage.exists(R2_HEALTH_CHECK_KEY);
    });
  }

  private async checkResend(): Promise<ServiceHealth> {
    return HealthCheckService.toServiceHealth(() => this.resendClient.checkHealth());
  }

  private async checkMureka(): Promise<ServiceHealth> {
    return HealthCheckService.toServiceHealth(async () => {
      await this.murekaClient.getAccountBilling();
    });
  }

  private static async toServiceHealth(check: () => Promise<void>): Promise<ServiceHealth> {
    try {
      await check();
      return { status: "ok" };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
