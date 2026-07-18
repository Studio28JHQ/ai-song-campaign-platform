"use client";

import { useCallback, useEffect, useState } from "react";
import { type AdminUserRow, listAdminUsers } from "../services/adminUsers";

export interface AdminUsersListState {
  items: AdminUserRow[];
  isLoading: boolean;
  errorMessage: string | null;
  refetch: () => void;
}

/** Loads the "Administradores" list, with a `refetch` for after create/edit/password/activation actions. */
export function useAdminUsersList(): AdminUsersListState {
  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    listAdminUsers()
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
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  return { items, isLoading, errorMessage, refetch };
}
