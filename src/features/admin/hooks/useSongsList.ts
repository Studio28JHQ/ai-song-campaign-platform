"use client";

import { useCallback, useEffect, useState } from "react";
import { type AdminSongRow, listSongs } from "../services/listSongs";

export interface SongsListState {
  items: AdminSongRow[];
  isLoading: boolean;
  errorMessage: string | null;
  refetch: () => void;
}

/** Loads the "Canciones" list, with a `refetch` for after a resend action. */
export function useSongsList(): SongsListState {
  const [items, setItems] = useState<AdminSongRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    listSongs()
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
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  return { items, isLoading, errorMessage, refetch };
}
