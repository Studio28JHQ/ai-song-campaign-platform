"use client";

import { useEffect, useState } from "react";
import { type AdminSongRow, type SongStatusFilter, listSongs } from "../services/listSongs";

const DEFAULT_PAGE_SIZE = 20;

export interface SongsListState {
  items: AdminSongRow[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  status: SongStatusFilter | "";
  isLoading: boolean;
  errorMessage: string | null;
}

export interface SongsListActions {
  setQuery: (query: string) => void;
  setStatus: (status: SongStatusFilter | "") => void;
  setPage: (page: number) => void;
  refetch: () => void;
}

/**
 * Drives the admin "Canciones" list: free-text search, status filter,
 * and pagination — refetching `GET /api/admin/songs` whenever any of
 * them change, the same pattern `useLeadSearch` already follows for
 * "Familias". Changing the query or status always resets back to page
 * 1. `refetch` re-runs the current page/filter (e.g. after a retry or
 * resend action) without resetting pagination.
 */
export function useSongsList(): SongsListState & SongsListActions {
  const [query, setQueryState] = useState("");
  const [status, setStatusState] = useState<SongStatusFilter | "">("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminSongRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    listSongs({
      query: query || undefined,
      status: status || undefined,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
    })
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
  }, [query, status, page, reloadToken]);

  function setQuery(nextQuery: string): void {
    setQueryState(nextQuery);
    setPage(1);
  }

  function setStatus(nextStatus: SongStatusFilter | ""): void {
    setStatusState(nextStatus);
    setPage(1);
  }

  function refetch(): void {
    setReloadToken((token) => token + 1);
  }

  return {
    items,
    total,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    query,
    status,
    isLoading,
    errorMessage,
    setQuery,
    setStatus,
    setPage,
    refetch,
  };
}
