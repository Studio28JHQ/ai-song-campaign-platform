"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { getGtmSettings } from "../services/getGtmSettings";

/**
 * Feature 1 — Google Tag Manager Configuration. Renders the official GTM
 * snippet (script + `<noscript>` fallback) only when an admin has set a
 * container id — this is the single place any tracking code can ever
 * reach the Landing; future analytics integrations must be added inside
 * GTM itself, never as new code here. Reads the id from
 * `GET /api/settings/gtm` (public, read-only — the value itself always
 * comes from `Campaign.gtmContainerId`, validated against
 * `GTM-[A-Z0-9]+` before it is ever persisted, never an environment
 * variable or a hardcoded value). Client-side, matching every other
 * dynamic read in this codebase (see `docs/Architecture/Folder_Structure.md`
 * — `features/*` `services`) — a failed/slow lookup never blocks the
 * Landing's own render.
 */
export function GoogleTagManager() {
  const [containerId, setContainerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getGtmSettings()
      .then((settings) => {
        if (!cancelled) setContainerId(settings.gtmContainerId);
      })
      .catch(() => {
        // Best-effort: analytics must never surface an error to the visitor.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!containerId) {
    return null;
  }

  return (
    <>
      <Script id="gtm-script" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${containerId}');`}
      </Script>
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${containerId}`}
          height="0"
          width="0"
          style={{ display: "none", visibility: "hidden" }}
          title="Google Tag Manager"
        />
      </noscript>
    </>
  );
}
