"use client";

import { useEffect, useState } from "react";
import { type DashboardSummary, getDashboardSummary } from "../services/getDashboardSummary";

export interface DashboardSummaryState {
  summary: DashboardSummary | null;
  isLoading: boolean;
  errorMessage: string | null;
}

/** Loads the dashboard's four summary cards once on mount. */
export function useDashboardSummary(): DashboardSummaryState {
  const [state, setState] = useState<DashboardSummaryState>({
    summary: null,
    isLoading: true,
    errorMessage: null,
  });

  useEffect(() => {
    let cancelled = false;

    getDashboardSummary()
      .then((summary) => {
        if (!cancelled) setState({ summary, isLoading: false, errorMessage: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Something went wrong.";
        setState({ summary: null, isLoading: false, errorMessage: message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
