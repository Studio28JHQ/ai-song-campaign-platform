"use client";

import { useEffect, useState } from "react";
import { type CampaignSettings, getCampaignSettings } from "../services/campaignSettings";

export interface CampaignSettingsState {
  settings: CampaignSettings | null;
  isLoading: boolean;
  errorMessage: string | null;
}

/** Loads the campaign's editable global settings for the Configuración screen. */
export function useCampaignSettings(): CampaignSettingsState {
  const [settings, setSettings] = useState<CampaignSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getCampaignSettings()
      .then((result) => {
        if (cancelled) return;
        setSettings(result);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "Algo salió mal.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { settings, isLoading, errorMessage };
}
