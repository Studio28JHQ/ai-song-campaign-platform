import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { appConfig } from "@/config/app";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prismaClient?: PrismaClient };

/**
 * How many PostgreSQL connections a single process may hold.
 *
 * `pg` defaults to 10, which this deployment cannot afford. The database
 * is reached through Supabase's pooler **in session mode** (port 5432),
 * where every checked-out client holds one dedicated PostgreSQL
 * connection for as long as it stays checked out — the pool does not
 * multiplex — and this project's session pool is 15 connections wide.
 * At the default of 10, two processes (a deployed instance and a
 * developer's machine, or two warm serverless instances) exhaust it, and
 * every further query fails with
 * `(EMAXCONNSESSION) max clients reached in session mode`. That is
 * exactly what was observed on 2026-09-29, with all 15 session slots
 * checked out and 14 of them idle.
 *
 * Five is a budget, not a measurement of how much concurrency the code
 * needs — it is deliberately lower than that. Parts of this codebase
 * fan out much wider: `PrismaAdminDashboardGate.getSummary` issues
 * roughly seventeen queries in one `Promise.all`, and
 * `GetLeadDetailUseCase` four. Neither breaks. `pg` queues whatever
 * exceeds `max` and never opens extra connections, so the dashboard's
 * queries simply run in several waves instead of one, at the cost of
 * some latency on an admin-only screen.
 *
 * That trade is the point: a process waiting a moment for its own
 * connection is recoverable, a process that cannot get one at all is
 * not. Five leaves room for three processes inside the 15.
 *
 * It is a mitigation, not a fix. The 15-slot ceiling is still there and
 * enough concurrent processes will still reach it; this only bounds
 * what each one contributes. Moving to the pooler's transaction mode
 * (port 6543), where connections are multiplexed instead of held, is
 * the structural change, and it is deliberately not part of this one.
 */
const MAX_CONNECTIONS_PER_PROCESS = 5;

/**
 * How long an unused connection is kept before being returned.
 *
 * `pg` defaults to 10 seconds, which is cheap against a real connection
 * pool and expensive against a session-mode one: for those 10 seconds
 * the idle client is still holding a scarce session slot that no other
 * process can use. Two seconds keeps the benefit of reuse for the
 * back-to-back queries a single request makes, and gives the slot back
 * quickly enough that an idle process stops starving the others.
 */
const IDLE_CONNECTION_TIMEOUT_MS = 2_000;

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
