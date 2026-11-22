import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveDirectUrl } from "../../prisma/directUrl";

/**
 * The guard that stops a migration from being applied through the pooler's
 * transaction mode.
 *
 * This is a safety rail, not a feature, so the tests are about the two
 * ways it can fail open — an unset variable that silently falls back, and
 * a 6543 URL that looks configured but is the wrong door — plus the one
 * way it could fail closed and break a deployment, which is refusing a
 * command that needs no database at all. That last one is covered where
 * it actually lives, in `prisma.config.ts`'s lazy getter; here we pin that
 * this function is pure and only ever reads `DIRECT_URL`.
 */

const SESSION_URL =
  "postgresql://postgres.abcdefghijklmnop:s3cret@aws-1-sa-east-1.pooler.supabase.com:5432/postgres";
const TRANSACTION_URL = SESSION_URL.replace(":5432/", ":6543/");

let saved: { direct?: string; database?: string };

beforeEach(() => {
  saved = { direct: process.env["DIRECT_URL"], database: process.env["DATABASE_URL"] };
});

afterEach(() => {
  if (saved.direct === undefined) delete process.env["DIRECT_URL"];
  else process.env["DIRECT_URL"] = saved.direct;
  if (saved.database === undefined) delete process.env["DATABASE_URL"];
  else process.env["DATABASE_URL"] = saved.database;
});

describe("resolveDirectUrl", () => {
  it("returns a session-mode URL unchanged", () => {
    process.env["DIRECT_URL"] = SESSION_URL;

    expect(resolveDirectUrl()).toBe(SESSION_URL);
  });

  it("refuses an unset DIRECT_URL instead of falling back to DATABASE_URL", () => {
    delete process.env["DIRECT_URL"];
    // The trap this replaces: the app's transaction-mode URL is right
    // there, and the first version of this change used it.
    process.env["DATABASE_URL"] = TRANSACTION_URL;

    expect(() => resolveDirectUrl()).toThrow(/DIRECT_URL is not set/);
    // And never leaks the application's connection string into the error.
    try {
      resolveDirectUrl();
    } catch (error) {
      expect((error as Error).message).not.toContain(TRANSACTION_URL);
    }
  });

  it.each([
    ["an empty string", ""],
    ["whitespace only", "   "],
  ])("treats %s as unset", (_label, value) => {
    process.env["DIRECT_URL"] = value;

    expect(() => resolveDirectUrl()).toThrow(/DIRECT_URL is not set/);
  });

  it("refuses a DIRECT_URL that points at transaction mode (6543)", () => {
    process.env["DIRECT_URL"] = TRANSACTION_URL;

    expect(() => resolveDirectUrl()).toThrow(/port 6543, which is the pooler's transaction mode/);
  });

  it("names the port and the fix in the message, so the error is actionable", () => {
    process.env["DIRECT_URL"] = TRANSACTION_URL;

    try {
      resolveDirectUrl();
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("6543");
      expect(message).toContain("5432");
      expect(message).toContain("advisory locks");
      expect(message).toContain("prisma/directUrl.ts");
    }
  });

  it.each([
    ["a direct connection", "postgresql://postgres:s3cret@db.abcdef.supabase.co:5432/postgres"],
    ["a local database", "postgresql://user:password@localhost:5432/dbname?schema=public"],
    ["a non-default port that is not 6543", SESSION_URL.replace(":5432/", ":5433/")],
  ])("accepts %s", (_label, url) => {
    process.env["DIRECT_URL"] = url;

    expect(resolveDirectUrl()).toBe(url);
  });

  /**
   * Fails closed. An earlier version returned any value Node's `URL` could
   * not parse, unvalidated, reasoning that libpq accepts strings `URL`
   * does not. That was a hole: a string whose port cannot be read is a
   * string that might be `:6543`, which is the one thing this guard
   * exists to stop. Every path out is now a validated URI or an error.
   */
  describe("rejects anything whose port it cannot verify", () => {
    it.each([
      ["libpq's keyword form", "host=localhost port=5432 dbname=postgres"],
      ["a bare hostname", "aws-1-sa-east-1.pooler.supabase.com:5432"],
      ["free text", "the session pooler one"],
      // `URL` parses both of these without complaint, leaving an empty
      // hostname — found by this very test, which is why it is here.
      ["a scheme with no host", "postgresql://"],
      ["a URI with no host but a database", "postgresql:///postgres"],
    ])("refuses %s", (_label, value) => {
      process.env["DIRECT_URL"] = value;

      expect(() => resolveDirectUrl()).toThrow(/cannot be validated/);
    });

    it("refuses the keyword form even when its port is the safe 5432", () => {
      // The point is not that the value is wrong — it may well work. The
      // point is that this guard could not check it, and an unchecked
      // string is exactly what the hole used to let through.
      process.env["DIRECT_URL"] = "host=localhost port=5432 dbname=postgres";

      expect(() => resolveDirectUrl()).toThrow(/cannot be validated/);
      expect(() => resolveDirectUrl()).toThrow(/postgresql:\/\/USER:PASSWORD@HOST:5432\/DATABASE/);
    });

    it("refuses a URI whose scheme is not postgres", () => {
      process.env["DIRECT_URL"] = "mysql://user:pw@localhost:5432/db";

      expect(() => resolveDirectUrl()).toThrow(/scheme is "mysql:"/);
    });

    it("refuses libpq's multi-host form, where no single port can be read", () => {
      // The second host here *is* the transaction pooler, and `URL` folds
      // the whole list into one hostname, so the port check would miss it.
      // This is the form `URL` *does* parse, folding both hosts into one
      // hostname: the port check would read "" and wave it through. The
      // variant that carries a port per host fails to parse at all and is
      // caught a step earlier.
      process.env["DIRECT_URL"] =
        "postgresql://postgres.ref:pw@host-a.pooler.supabase.com,host-b.pooler.supabase.com/postgres";

      expect(() => resolveDirectUrl()).toThrow(/several hosts/);
    });

    it("explains that a password with URI characters is the likely cause", () => {
      process.env["DIRECT_URL"] = "not a uri at all";

      expect(() => resolveDirectUrl()).toThrow(/Percent-encode it/);
    });
  });

  describe("still rejects transaction mode, however it is expressed", () => {
    it("refuses an explicit :6543 in the authority", () => {
      process.env["DIRECT_URL"] = TRANSACTION_URL;

      expect(() => resolveDirectUrl()).toThrow(/port 6543, which is the pooler's transaction mode/);
    });

    it("refuses 6543 hidden in libpq's ?port= parameter", () => {
      // libpq honours `?port=`, which overrides the authority — so without
      // this check a 6543 connection would pass while `url.port` read 5432.
      process.env["DIRECT_URL"] = `${SESSION_URL}?port=6543`;

      expect(() => resolveDirectUrl()).toThrow(/in its \?port= parameter/);
    });

    /**
     * Repeated `port` parameters, measured on 2026-11-22: node-postgres
     * takes the last, `URLSearchParams.get` takes the first, and the
     * Prisma CLI's engine ignores `?port=` altogether. So
     * `?port=5432&port=6543` read as safe through `get("port")` while
     * `prisma db seed` would have connected to the transaction pooler.
     */
    it.each([
      ["safe first, pooler last — the bypass", `${SESSION_URL}?port=5432&port=6543`],
      ["pooler first, safe last", `${SESSION_URL}?port=6543&port=5432`],
      ["both the same", `${SESSION_URL}?port=5432&port=5432`],
      ["three of them", `${SESSION_URL}?port=5432&port=5432&port=6543`],
    ])("refuses %s", (_label, url) => {
      process.env["DIRECT_URL"] = url;

      expect(() => resolveDirectUrl()).toThrow(/which one wins depends on who reads the string/);
    });

    it("names every port it found, and says which reader takes which", () => {
      process.env["DIRECT_URL"] = `${SESSION_URL}?port=5432&port=6543`;

      try {
        resolveDirectUrl();
        expect.unreachable("should have thrown");
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain("2 `port` parameters (5432, 6543)");
        expect(message).toContain("takes the LAST");
        expect(message).toContain("takes the FIRST");
      }
    });

    /**
     * The same defect in a different spelling: a padded value evaded a
     * string comparison while Node coerced it to a number and connected.
     * Verified against a live database — `?port=%205432` with an
     * unreachable authority port still connected.
     */
    it.each([
      ["a leading space", "%206543"],
      ["a trailing space", "6543%20"],
      ["leading zeros", "06543"],
      ["an explicit sign", "%2B6543"],
    ])("refuses 6543 written with %s", (_label, value) => {
      process.env["DIRECT_URL"] = `${SESSION_URL}?port=${value}`;

      expect(() => resolveDirectUrl()).toThrow(/transaction mode/);
    });

    it.each([
      ["not a number", "abc"],
      ["empty", ""],
      ["out of range", "70000"],
      ["fractional", "6543.5"],
    ])("refuses a ?port= that is %s, rather than ignoring it", (_label, value) => {
      process.env["DIRECT_URL"] = `${SESSION_URL}?port=${value}`;

      expect(() => resolveDirectUrl()).toThrow(/is not a port number/);
    });

    it("allows a ?port= that is not 6543", () => {
      const url = `${SESSION_URL}?port=5432&sslmode=require`;
      process.env["DIRECT_URL"] = url;

      expect(resolveDirectUrl()).toBe(url);
    });

    it("allows a URI with no explicit port, which defaults to 5432", () => {
      const url = "postgresql://postgres.ref:pw@aws-1-sa-east-1.pooler.supabase.com/postgres";
      process.env["DIRECT_URL"] = url;

      expect(resolveDirectUrl()).toBe(url);
    });
  });

  it("trims surrounding whitespace", () => {
    process.env["DIRECT_URL"] = `  ${SESSION_URL}  `;

    expect(resolveDirectUrl()).toBe(SESSION_URL);
  });
});
