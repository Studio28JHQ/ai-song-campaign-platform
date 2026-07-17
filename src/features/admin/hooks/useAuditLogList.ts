"use client";

import { useEffect, useState } from "react";
import { type AuditLogRow, listAuditLog } from "../services/listAuditLog";

const DEFAULT_PAGE_SIZE = 20;

export interface AuditLogListState {
  items: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  isLoading: boolean;
  errorMessage: string | null;
}

export interface AuditLogListActions {
  setQuery: (query: string) => void;
  setPage: (page: number) => void;
}

/**
 * Drives the admin "Auditoría" list: free-text search (action/entity/
 * entityId) and pagination — refetching `GET /api/admin/audit`
 * whenever either changes, the same pattern `useLeadSearch`/
 * `useLyricsList` already follow. Changing the query always resets
 * back to page 1.
 */
export function useAuditLogList(): AuditLogListState & AuditLogListActions {
  const [query, setQueryState] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    listAuditLog({ query: query || undefined, page, pageSize: DEFAULT_PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setItems([]);
        setTotal(0);
        setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, page]);

  function setQuery(nextQuery: string): void {
    setQueryState(nextQuery);
    setPage(1);
  }

  return {
    items,
    total,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    query,
    isLoading,
    errorMessage,
    setQuery,
    setPage,
  };
}
