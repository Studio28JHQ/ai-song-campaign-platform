import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { appConfig } from "@/config/app";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prismaClient?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: appConfig.database.url });
  return new PrismaClient({ adapter });
}

/**
 * Singleton Prisma Client, cached on `globalThis` so Next.js's dev-mode
 * module reloading doesn't spawn a new connection pool on every reload.
 * Shared by every Prisma-backed repository, not just Lead's.
 */
export const prisma: PrismaClient = globalForPrisma.prismaClient ?? createPrismaClient();
globalForPrisma.prismaClient = prisma;
