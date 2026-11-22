import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * `prisma.config.ts` exposes the CLI connection string through a getter,
 * and that is load-bearing for the deployment, not a style choice.
 *
 * `prisma generate` is this project's `postinstall`, so it runs on every
 * Vercel build — and it needs no database. If the datasource URL were an
 * eagerly-evaluated value, the guard in `prisma/directUrl.ts` would throw
 * while the config file was merely being read, and a deployment that
 * happened to lack `DIRECT_URL` would fail to build instead of simply
 * being unable to migrate. A safety rail that causes outages gets removed.
 *
 * Verified by hand against the real CLI on 2026-11-22 (`prisma generate`
 * succeeds with `DIRECT_URL` unset; `prisma migrate status` refuses with
 * the guard's message); this pins it so the next edit cannot undo it
 * silently.
 */

let saved: string | undefined;

beforeEach(() => {
  saved = process.env["DIRECT_URL"];
});

afterEach(() => {
  if (saved === undefined) delete process.env["DIRECT_URL"];
  else process.env["DIRECT_URL"] = saved;
});

describe("prisma.config.ts", () => {
  it("loads without a DIRECT_URL, so a database-free command still runs", async () => {
    delete process.env["DIRECT_URL"];

    const config = (await import("../../prisma.config")).default;

    expect(config.schema).toBe("prisma/schema.prisma");
    expect(config.migrations?.path).toBe("prisma/migrations");
  });

  it("throws only when the URL is actually read", async () => {
    delete process.env["DIRECT_URL"];
    const config = (await import("../../prisma.config")).default;

    expect(() => config.datasource?.url).toThrow(/DIRECT_URL is not set/);
  });

  it("returns the direct URL once configured", async () => {
    const url =
      "postgresql://postgres.abcdefghijklmnop:s3cret@aws-1-sa-east-1.pooler.supabase.com:5432/postgres";
    process.env["DIRECT_URL"] = url;
    const config = (await import("../../prisma.config")).default;

    expect(config.datasource?.url).toBe(url);
  });

  it("refuses a transaction-mode URL when read", async () => {
    process.env["DIRECT_URL"] =
      "postgresql://postgres.abcdefghijklmnop:s3cret@aws-1-sa-east-1.pooler.supabase.com:6543/postgres";
    const config = (await import("../../prisma.config")).default;

    expect(() => config.datasource?.url).toThrow(/transaction mode/);
  });
});
