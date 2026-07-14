import type { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * `/generate` and `/song` are mid-funnel steps that depend on client-side
 * session state from registration — they render nothing meaningful to a
 * crawler visiting directly, so they're excluded here rather than
 * indexed. `/admin` and `/api` are operator/backend surfaces, already
 * behind authentication.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/generate", "/song"],
    },
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
