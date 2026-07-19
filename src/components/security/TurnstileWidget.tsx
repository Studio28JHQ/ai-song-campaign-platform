"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef } from "react";

/**
 * Cloudflare Turnstile (Sprint 8.2 — Abuse Protection) rendered via the
 * vendor's plain `api.js` script and explicit render API — no extra npm
 * dependency, consistent with PROJECT_MANIFEST.md's single-provider,
 * no-unnecessary-dependency stance. `siteKey` is passed down from a
 * Server Component page reading `appConfig.security.turnstile.siteKey`
 * (same pattern as `LyricsWorkflow`'s `maxAttempts`/`supportEmail`) —
 * this file lives under `src/`, which the `no-restricted-properties`
 * ESLint rule forbids from reading `process.env` directly.
 *
 * The token this produces is never trusted on its own — the server
 * always re-verifies it against Cloudflare's `siteverify` endpoint (see
 * `TurnstileVerifier`) before any registration or lyrics generation is
 * processed.
 */

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
}

interface TurnstileGlobal {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileGlobal;
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar el widget de verificación."));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export interface TurnstileWidgetProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
}

/**
 * Imperative handle exposed to consumers so a failed submission can force
 * a fresh token out of the *same* rendered widget (`window.turnstile.reset`)
 * instead of unmounting/remounting it — a used-up token is never reused by
 * a retry (see `TurnstileVerifier.isExpiredOrAlreadyUsed`).
 */
export interface TurnstileWidgetHandle {
  reset: () => void;
}

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ siteKey, onVerify, onExpire, onError }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const id = useId();

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
    }));

    useEffect(() => {
      let cancelled = false;

      loadTurnstileScript()
        .then(() => {
          if (cancelled || !containerRef.current || !window.turnstile) return;

          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            callback: onVerify,
            "expired-callback": onExpire,
            "error-callback": onError,
          });
        })
        .catch(() => {
          onError?.();
        });

      return () => {
        cancelled = true;
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
        }
      };
      // Mount once — resets are driven imperatively via the exposed handle,
      // not by re-running this effect.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div ref={containerRef} id={`turnstile-${id}`} data-testid="turnstile-widget" />;
  },
);
