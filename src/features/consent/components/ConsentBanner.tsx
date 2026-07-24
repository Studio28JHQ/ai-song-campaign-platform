"use client";

import { useEffect, useState } from "react";
import { CampaignButton } from "@/components/campaign/CampaignButton";
import { CampaignCard } from "@/components/campaign/CampaignCard";
import { CampaignContainer } from "@/components/campaign/CampaignContainer";
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
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6"
    >
      <CampaignContainer>
        <CampaignCard className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body text-foreground">
            Usamos cookies propias para recordar tu preferencia y medir el rendimiento de la
            campaña. Al aceptar, confirmas que estás de acuerdo con nuestra política de privacidad.
          </p>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <CampaignButton
              type="button"
              onClick={handleAccept}
              disabled={isSubmitting}
              className="h-10 shrink-0 px-6 text-sm"
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
      </CampaignContainer>
    </div>
  );
}
