import "dotenv/config";
import { AdminUser } from "@/domain/admin/entities/AdminUser";
import { ADMIN_ROLES } from "@/domain/admin/types";
import { ScryptPasswordHasher } from "@/infrastructure/auth/ScryptPasswordHasher";
import { PrismaAdminUserRepository } from "@/infrastructure/persistence/prisma/admin/PrismaAdminUserRepository";
import { prisma } from "@/infrastructure/persistence/prisma/client";

/**
 * HOTFIX-ADMIN-2 — Bootstrap First Administrator. A one-off,
 * command-line provisioning tool for the very first `AdminUser` row in
 * a database — the same gap `prisma/seed.ts` deliberately leaves open
 * ("`AdminUser` is deliberately provisioned manually, never via a
 * committed seed, since that would mean checking a credential into
 * source control"). This script takes the email/password/name/role as
 * CLI arguments rather than environment variables or hardcoded
 * defaults, so no credential ever needs to be committed to run it.
 *
 * Reuses the exact same domain/application/infrastructure seams the
 * Administradores screen uses (`AdminUser.create`/`updateProfile`/
 * `changePasswordHash`/`activate`, `AdminUserRepository`,
 * `PasswordHasher`) — the resulting row is indistinguishable from one
 * created through the Backoffice.
 *
 * Idempotent: if the email already exists, its password/role/active
 * state are updated in place — it is never duplicated.
 *
 * Usage:
 *   npx tsx --conditions=react-server scripts/bootstrapAdmin.ts \
 *     --email=someone@example.com --password='...' --name="Jane Admin" --role=SUPER_ADMIN
 */

interface CliArgs {
  email: string;
  password: string;
  name: string;
  role: string;
}

function parseArgs(argv: string[]): CliArgs {
  const values = new Map<string, string>();

  for (const arg of argv) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) {
      values.set(match[1], match[2]);
    }
  }

  const email = values.get("email");
  const password = values.get("password");
  const name = values.get("name");
  const role = values.get("role") ?? "SUPER_ADMIN";

  if (!email || !password || !name) {
    throw new Error(
      "Usage: tsx scripts/bootstrapAdmin.ts --email=... --password=... --name=... [--role=ADMIN|SUPER_ADMIN]",
    );
  }

  if (!ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
    throw new Error(`--role must be one of: ${ADMIN_ROLES.join(", ")}.`);
  }

  return { email, password, name, role };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const adminUserRepository = new PrismaAdminUserRepository();
  const passwordHasher = new ScryptPasswordHasher();
  const passwordHash = await passwordHasher.hash(args.password);

  const existing = await adminUserRepository.findByEmail(args.email.trim().toLowerCase());

  if (existing) {
    existing.updateProfile({ name: args.name, role: args.role });
    existing.changePasswordHash(passwordHash);
    existing.activate();
    const updated = await adminUserRepository.update(existing);
    console.log(
      `Updated existing admin "${updated.email}" (${updated.id}) — role=${updated.role}, active=${updated.active}.`,
    );
    return;
  }

  const admin = AdminUser.create({
    email: args.email,
    passwordHash,
    name: args.name,
    role: args.role,
  });
  const created = await adminUserRepository.create(admin);
  console.log(
    `Created admin "${created.email}" (${created.id}) — role=${created.role}, active=${created.active}.`,
  );
}

main()
  .catch((error) => {
    console.error("Bootstrap failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
