"use client";

import { useEffect, useState } from "react";
import {
  GetLeadDetailError,
  type LeadDetailResult,
  getLeadDetail,
} from "../services/getLeadDetail";

export interface LeadDetailState {
  detail: LeadDetailResult | null;
  isLoading: boolean;
  notFound: boolean;
  errorMessage: string | null;
}

/** Loads the read-only Lead Detail screen data once on mount. */
export function useLeadDetail(leadId: string): LeadDetailState {
  const [state, setState] = useState<LeadDetailState>({
    detail: null,
    isLoading: true,
    notFound: false,
    errorMessage: null,
  });

  useEffect(() => {
    let cancelled = false;

    getLeadDetail(leadId)
      .then((detail) => {
        if (!cancelled) setState({ detail, isLoading: false, notFound: false, errorMessage: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const notFound = error instanceof GetLeadDetailError && error.notFound;
        const message = error instanceof Error ? error.message : "Something went wrong.";
        setState({ detail: null, isLoading: false, notFound, errorMessage: message });
      });

    return () => {
      cancelled = true;
    };
  }, [leadId]);

  return state;
}
