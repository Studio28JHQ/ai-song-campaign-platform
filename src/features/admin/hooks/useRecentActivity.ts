"use client";

import { useEffect, useState } from "react";
import { type RecentActivityRow, listRecentActivity } from "../services/listRecentActivity";

export interface RecentActivityState {
  items: RecentActivityRow[];
  isLoading: boolean;
  errorMessage: string | null;
}

/** Loads the Dashboard's "Actividad reciente" panel once on mount. Read-only — nothing on this panel mutates state, so no refetch is needed. */
export function useRecentActivity(): RecentActivityState {
  const [items, setItems] = useState<RecentActivityRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    listRecentActivity()
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
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
