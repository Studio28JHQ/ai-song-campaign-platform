import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The `ffmpeg-static` binary (`FfmpegAudioProcessor`) is referenced
  // only as a file path passed to `child_process.spawn`, never
  // `require()`'d as a module — Vercel's build-time file tracer can't
  // discover it on its own the way it does an actual import, so it
  // must be force-included or the deployed function would spawn a
  // binary that was never bundled. Scoped to the one route that
  // actually runs it (`GET /api/internal/pipeline/run` — see that
  // route's own `maxDuration` comment) rather than the whole app.
  outputFileTracingIncludes: {
    "/api/internal/pipeline/run": ["./node_modules/ffmpeg-static/**"],
  },
  images: {
    // Sprint UI-3A — Landing Experience. AVIF listed first: `next/image`
    // negotiates the smallest format the requesting browser supports,
    // preferring AVIF, falling back to WEBP, then the original format.
    formats: ["image/avif", "image/webp"],
    // Required for `next/image` to serve the campaign's own decorative
    // SVGs (`public/campaign/illustrations/`, `.../patterns/`) at all —
    // disabled by default as an XSS precaution against *untrusted*
    // SVGs, which doesn't apply here (every SVG under `public/campaign/`
    // is hand-authored, committed source, never user-supplied). The
    // matching CSP further restricts what a served SVG could do even if
    // one were ever compromised.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
