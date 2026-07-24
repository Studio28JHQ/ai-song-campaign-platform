"use client";

import { useEffect, useState } from "react";
import { type AdminConsentRow, listConsents } from "../services/consents";

export interface ConsentsListState {
  items: AdminConsentRow[];
  isLoading: boolean;
  errorMessage: string | null;
}

/** Loads the latest 20 Consent records for the "Consentimientos" screen — no pagination/search, matching this screen's requirements. */
export function useConsentsList(): ConsentsListState {
  const [items, setItems] = useState<AdminConsentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    listConsents()
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setItems([]);
        setErrorMessage(error instanceof Error ? error.message : "Algo salió mal.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { items, isLoading, errorMessage };
}
