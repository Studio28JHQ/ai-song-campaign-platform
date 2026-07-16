"use client";

import { useEffect, useState } from "react";
import { type AdminLyricsRow, listLyrics } from "../services/listLyrics";

export interface LyricsListState {
  items: AdminLyricsRow[];
  isLoading: boolean;
  errorMessage: string | null;
}

/** Loads the "Letras" list once on mount. */
export function useLyricsList(): LyricsListState {
  const [items, setItems] = useState<AdminLyricsRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    listLyrics()
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
