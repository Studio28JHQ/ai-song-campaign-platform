/**
 * The connection string every Prisma CLI command must use, and the guard
 * that stops one from running against the wrong pooling mode.
 *
 * ## Why this exists
 *
 * The application and the CLI now reach the same database through two
 * different doors:
 *
 * - **`DATABASE_URL`** — the Supavisor pooler in **transaction mode**
 *   (port 6543). Connections are multiplexed and handed back at every
 *   transaction boundary, which is what a serverless deployment needs and
 *   what `src/infrastructure/persistence/prisma/client.ts` uses.
 * - **`DIRECT_URL`** — a **session-mode** or direct connection (port
 *   5432). This is what `prisma migrate`, `db push`, `db pull` and
 *   `db seed` need, because they depend on session state that transaction
 *   mode does not keep: advisory locks above all, which is how `migrate`
 *   serialises concurrent runs and refuses to apply the same migration
 *   twice.
 *
 * A migration run against transaction mode is the specific accident this
 * module exists to prevent, and every path out of `resolveDirectUrl` is
 * either a validated URI or an error — never an unchecked string.
 *
 * Such a run does not fail cleanly: it can take the lock, lose it at a
 * transaction boundary, and leave the migration half-applied with
 * `_prisma_migrations` recording a state the database is not in. This
 * repository already carries one row from a failed migration
 * (`20260716083000_abuse_protection`, rolled back on 2026-07-15), and
 * recovering from that by hand against a live campaign is work nobody
 * should have to do twice.
 *
 * ## Why there is no fallback
 *
 * The first version of this change read
 * `process.env.DIRECT_URL ?? process.env.DATABASE_URL`, so a machine
 * without the new variable kept working. That convenience is exactly the
 * trap: it means forgetting one variable silently points every migration
 * at the transaction pooler, which is the one outcome worth failing a
 * command over. An unset `DIRECT_URL` is now an error with a sentence
 * saying what to set, and so is one whose port cannot be read.
 */

/** The Supavisor port that serves transaction mode — never valid here. */
const TRANSACTION_POOLER_PORT = "6543";

/** The URI schemes libpq accepts, and the only ones this guard can read. */
const POSTGRES_SCHEMES = ["postgres:", "postgresql:"] as const;

const MISSING_MESSAGE = [
  "DIRECT_URL is not set, and Prisma CLI commands refuse to guess.",
  "",
  "Set DIRECT_URL to a session-mode or direct connection (port 5432).",
  "It is the same connection string as DATABASE_URL with the port changed",
  `from ${TRANSACTION_POOLER_PORT} back to 5432 — same host, same user.`,
  "",
  "DATABASE_URL points at the pooler in transaction mode, which does not",
  "keep the advisory locks `prisma migrate` depends on. This command will",
  "not fall back to it: a migration applied through transaction mode can",
  "be left half-finished. See prisma/directUrl.ts.",
].join("\n");

function unreadableMessage(reason: string): string {
  return [
    `DIRECT_URL cannot be validated: ${reason}`,
    "",
    "It must be a PostgreSQL URI this guard can read, so that the port can",
    "be checked before any migration runs:",
    "",
    "  postgresql://USER:PASSWORD@HOST:5432/DATABASE",
    "",
    "Rejected rather than passed through: a connection string whose port",
    "cannot be read is one that might be the transaction pooler, and the",
    "whole purpose of this check is that a migration never reaches it.",
    "",
    "If the value looks right, the usual cause is a password containing",
    "characters that have meaning in a URI (/ ? # @ :). Percent-encode it",
    "(for example `/` as %2F), or use libpq's keyword form in DATABASE_URL",
    "only — never here. See prisma/directUrl.ts.",
  ].join("\n");
}

function ambiguousPortMessage(values: readonly string[]): string {
  return [
    `DIRECT_URL carries ${values.length} \`port\` parameters (${values.join(", ")}), and which one wins depends on who reads the string.`,
    "",
    "Measured on 2026-11-22, all three disagree:",
    "  - node-postgres (`prisma db seed`) takes the LAST one.",
    "  - URLSearchParams.get, which this guard used, takes the FIRST.",
    "  - the Prisma CLI's engine (`prisma migrate`) ignores ?port= entirely",
    "    and uses the port in the authority.",
    "",
    "So `?port=5432&port=6543` read as safe here while `prisma db seed`",
    "would have connected to the transaction pooler. Rejected rather than",
    "resolved: a port this guard cannot determine unambiguously is a port",
    "it cannot clear. Use exactly one port, in the authority.",
    "See prisma/directUrl.ts.",
  ].join("\n");
}

/**
 * Whether a port value means the transaction pooler.
 *
 * Compared as a number, not as a string, because the string form is not
 * canonical and a mismatch there is a bypass: measured on 2026-11-22,
 * `?port=%206543` reaches node-postgres as `" 6543"`, which Node coerces
 * to 6543 and connects on — while `" 6543" !== "6543"` let it straight
 * past an earlier version of this check. Leading zeros and a `+` sign
 * coerce the same way.
 */
function isTransactionPoolerPort(value: string): boolean {
  return Number(value.trim()) === Number(TRANSACTION_POOLER_PORT);
}

function transactionModeMessage(port: string, where: string): string {
  return [
    `DIRECT_URL points at port ${port}${where}, which is the pooler's transaction mode.`,
    "",
    "Prisma CLI commands need session state (advisory locks, SET, temporary",
    "tables) that transaction mode discards at every transaction boundary.",
    "Change DIRECT_URL to port 5432 — same host, same user — or use the",
    "project's direct connection string. See prisma/directUrl.ts.",
  ].join("\n");
}

/**
 * Returns the CLI connection string, or throws with an actionable
 * message. Called lazily — see the getter in `prisma.config.ts` — so that
 * commands which need no database (notably `prisma generate`, which runs
 * as this project's `postinstall` on every Vercel build) are never
 * blocked by a variable they do not use.
 *
 * ## Fail closed, including when the value cannot be read
 *
 * An earlier version returned any value Node's `URL` could not parse,
 * unvalidated, on the reasoning that libpq accepts connection strings
 * `URL` does not. That was a hole, not a kindness: a string whose port
 * cannot be read is a string that might be `:6543`, and letting it
 * through defeated the only thing this function exists to do. Every path
 * out of here is now either a validated URI or an error.
 *
 * The cost is real and deliberate: libpq's keyword form
 * (`host=... port=...`) and multi-host URIs are refused even when they
 * would work, because their port cannot be checked with confidence. The
 * error says so and says what to use instead. `DATABASE_URL`, which this
 * guard never touches, is free to use any form the driver accepts.
 */
export function resolveDirectUrl(): string {
  const raw = process.env["DIRECT_URL"]?.trim();

  if (!raw) {
    throw new Error(MISSING_MESSAGE);
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(unreadableMessage("it is not a URI Node can parse."));
  }

  if (!POSTGRES_SCHEMES.includes(parsed.protocol as (typeof POSTGRES_SCHEMES)[number])) {
    throw new Error(
      unreadableMessage(`its scheme is "${parsed.protocol}", not postgres: or postgresql:.`),
    );
  }

  // `URL` parses "postgresql://" and "postgresql:///db" without complaint,
  // leaving an empty hostname. There is no port to check in either, and
  // neither is a usable connection string.
  if (parsed.hostname.length === 0) {
    throw new Error(unreadableMessage("it names no host, so there is no port to check."));
  }

  // A comma means libpq's multi-host form. `URL` folds the whole list into
  // one hostname, so no single port can be read from it — and one of the
  // hosts could be the transaction pooler.
  if (parsed.hostname.includes(",")) {
    throw new Error(unreadableMessage("it lists several hosts, so no single port can be checked."));
  }

  if (parsed.port.length > 0 && isTransactionPoolerPort(parsed.port)) {
    throw new Error(transactionModeMessage(parsed.port, ""));
  }

  // `?port=` overrides the authority for node-postgres — which is what
  // `prisma db seed` connects through — so it has to be checked too. More
  // than one of them cannot be checked at all: see `ambiguousPortMessage`
  // for the three readers that disagree about which would win.
  const portParameters = parsed.searchParams.getAll("port");

  if (portParameters.length > 1) {
    throw new Error(ambiguousPortMessage(portParameters));
  }

  const parameterPort = portParameters[0];
  if (parameterPort !== undefined) {
    const asNumber = Number(parameterPort.trim());
    if (!Number.isInteger(asNumber) || asNumber <= 0 || asNumber > 65535) {
      throw new Error(
        unreadableMessage(`its ?port= parameter ("${parameterPort}") is not a port number.`),
      );
    }

    if (isTransactionPoolerPort(parameterPort)) {
      throw new Error(transactionModeMessage(parameterPort.trim(), " in its ?port= parameter"));
    }
  }

  return raw;
}
