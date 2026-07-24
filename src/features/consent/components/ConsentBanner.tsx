"use client";

import { useEffect, useState } from "react";
import { CampaignButton } from "@/components/campaign/CampaignButton";
import { CampaignCard } from "@/components/campaign/CampaignCard";
import { acceptConsent, ConsentError } from "../services/acceptConsent";

const CONSENT_ACCEPTED_STORAGE_KEY = "consent_accepted";

/**
 * Feature 2 — Privacy Consent Module. Shown only until the visitor
 * accepts, then hidden permanently — tracked client-side via
 * `localStorage` so a returning visitor never sees it again without a
 * round trip; the authoritative record is the server-side `Consent` row
 * plus the `consent_session_id` cookie created by `POST /api/consent`
 * (see `RecordConsentUseCase`). Built entirely from the campaign's
 * existing design system (`Campaign*` components) — no new visual
 * language.
 *
 * Deliberately does not use `CampaignContainer` (the max-width shell
 * every other Landing section shares) — the banner instead sizes itself
 * to ~90% of the viewport width via `w-[90vw]`, centered with `mx-auto`,
 * a look specific to this banner alone. The Accept button overrides
 * only its own `bg-*`/`hover:bg-*` classes (never `CampaignButton`
 * itself, which every other primary action on the Landing still uses
 * unmodified): a lighter tint of the brand primary by default,
 * transitioning to the exact primary color on hover.
 *
 * Renders as a sibling of `<main>`, not a descendant (see `app/page.tsx`
 * — it must overlay every section, including the footer), so it carries
 * its own `theme-campaign campaign-landing` classes rather than
 * inheriting them from `<main>`: those two classes are what actually
 * define `--primary`/`--card`/`--border`/the campaign body font (see
 * `app/globals.css`) — without them here, "the project's primary purple
 * color" would resolve to the unrelated default (non-campaign) theme.
 */
export function ConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const alreadyAccepted = window.localStorage.getItem(CONSENT_ACCEPTED_STORAGE_KEY) === "true";
    setVisible(!alreadyAccepted);
  }, []);

  async function handleAccept() {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await acceptConsent();
      window.localStorage.setItem(CONSENT_ACCEPTED_STORAGE_KEY, "true");
      setVisible(false);
    } catch (error) {
      setErrorMessage(
        error instanceof ConsentError ? error.message : "Algo salió mal. Inténtalo de nuevo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!visible) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Aviso de privacidad"
      className="theme-campaign campaign-landing fixed inset-x-0 bottom-0 z-50 pb-4"
    >
      <CampaignCard className="mx-auto flex w-[90vw] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body text-foreground">
          <strong>Tu privacidad es importante</strong> En Bassa, mejoramos tu experiencia de compra
          mediante el uso de cookies propias y de terceros en nuestro sitio web. Realizamos análisis
          estadísticos y mostramos publicidad según tus preferencias y hábitos de navegación. Puedes
          aceptar todas las cookies haciendo clic en &apos;Aceptar&apos; o rechazarlas con
          &apos;Rechazar&apos;. En este último caso, solo se activarán las cookies necesarias
          conforme a nuestras{" "}
          <strong>
            <a
              href="https://bassa.com.ec/politica-de-privacidad/"
              target="_blank"
              rel="noopener noreferrer"
              title="Políticas de Privacidad"
              className="underline"
            >
              Políticas de Privacidad
            </a>
          </strong>
        </p>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <CampaignButton
            type="button"
            onClick={handleAccept}
            disabled={isSubmitting}
            className="h-10 shrink-0 bg-primary/80 px-6 text-sm text-primary-foreground hover:bg-primary"
          >
            {isSubmitting ? "Guardando..." : "Aceptar"}
          </CampaignButton>
          {errorMessage ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </CampaignCard>
    </div>
  );
}
