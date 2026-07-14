"use client";

import { useCallback, useEffect, useState } from "react";
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
  /** Re-fetches the detail data — used after a Retry/Resend action changes it. */
  refetch: () => void;
}

/** Loads the read-only Lead Detail screen data on mount, and on demand via `refetch`. */
export function useLeadDetail(leadId: string): LeadDetailState {
  const [state, setState] = useState<Omit<LeadDetailState, "refetch">>({
    detail: null,
    isLoading: true,
    notFound: false,
    errorMessage: null,
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, isLoading: true }));

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
  }, [leadId, version]);

  const refetch = useCallback(() => setVersion((prev) => prev + 1), []);

  return { ...state, refetch };
}
