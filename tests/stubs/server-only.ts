// No-op stand-in for the `server-only` package during tests. Next.js
// replaces the real package with a no-op at build time (via webpack
// aliasing) whenever it's imported from a server context; Vitest doesn't
// do that automatically, so this alias (see vitest.config.ts) does it
// instead. The real package's own protection still applies to `next build`.
export {};
