"use client";

import { useEffect, useState } from "react";
import { type AuditLogRow, listAuditLog } from "../services/listAuditLog";

export interface AuditLogListState {
  items: AuditLogRow[];
  isLoading: boolean;
  errorMessage: string | null;
}

/** Loads the "Auditoría" list. Read-only — no refetch is needed since nothing on this screen mutates state. */
export function useAuditLogList(): AuditLogListState {
  const [items, setItems] = useState<AuditLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    listAuditLog()
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setItems([]);
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
