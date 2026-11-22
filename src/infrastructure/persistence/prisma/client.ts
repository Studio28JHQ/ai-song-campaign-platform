import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { appConfig } from "@/config/app";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prismaClient?: PrismaClient };

/**
 * How many pooler connections a single process may hold.
 *
 * The database is reached through Supabase's pooler **in transaction
 * mode** (`DATABASE_URL`, port 6543), where a backend connection is
 * handed back at every transaction boundary instead of being held for the
 * life of the client. That is what makes this number cheap, and it is a
 * change from what this file used to do.
 *
 * Until 2026-11-22 the same pool went through session mode (port 5432),
 * which multiplexes nothing: every checked-out client pinned one
 * PostgreSQL connection, against a ceiling of 15 for the whole project.
 * Two incidents came out of that — 2026-09-29 and 2026-11-22, both with
 * all 15 slots taken and almost all of them idle, every further query
 * failing with `(EMAXCONNSESSION) max clients reached in session mode`.
 * Lowering this value to five was the mitigation; transaction mode is the
 * fix this comment used to say was still owed.
 *
 * Five is kept rather than raised, and deliberately not lowered to the
 * `connection_limit=1` Supabase suggests as a serverless starting point.
 * Parts of this codebase fan out much wider —
 * `PrismaAdminDashboardGate.getSummary` issues roughly seventeen queries
 * in one `Promise.all`, `GetLeadDetailUseCase` four — and `pg` queues
 * whatever exceeds `max` rather than opening more connections, so at one
 * the dashboard would serialise seventeen round trips for no benefit now
 * that holding a few pooled connections costs the rest of the deployment
 * nothing.
 */
const MAX_CONNECTIONS_PER_PROCESS = 5;

/**
 * How long an unused connection is kept before being returned.
 *
 * Back to `pg`'s own default of 10 seconds, from the 2 seconds session
 * mode forced. Under session mode those 10 seconds were expensive: an
 * idle client went on pinning one of 15 scarce slots that no other
 * process could use, so the pool was told to let go almost immediately
 * and pay to reconnect. In transaction mode an idle client holds no
 * backend connection, so the reason to hurry is gone and the longer
 * window simply buys back connection reuse across the several requests a
 * warm serverless instance serves.
 */
const IDLE_CONNECTION_TIMEOUT_MS = 10_000;

/**
 * The application's client, and the only one that uses `DATABASE_URL`.
 *
 * Every Prisma CLI command (`migrate`, `db push`, `db seed`) goes through
 * `DIRECT_URL` instead — see `prisma/directUrl.ts` for why transaction
 * mode cannot carry a migration, and `prisma.config.ts` for where that is
 * wired. Nothing here needs session state: this codebase has no
 * `$transaction`, no `SET`, no advisory lock, no `LISTEN` and no
 * temporary table, which is what makes transaction mode safe for the
 * runtime and unsafe for the CLI.
 */
function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: appConfig.database.url,
    max: MAX_CONNECTIONS_PER_PROCESS,
    idleTimeoutMillis: IDLE_CONNECTION_TIMEOUT_MS,
  });

  return new PrismaClient({ adapter });
}

/**
 * Singleton Prisma Client, cached on `globalThis` so Next.js's dev-mode
 * module reloading doesn't spawn a new connection pool on every reload.
 * Shared by every Prisma-backed repository, not just Lead's.
 */
export const prisma: PrismaClient = globalForPrisma.prismaClient ?? createPrismaClient();
globalForPrisma.prismaClient = prisma;
