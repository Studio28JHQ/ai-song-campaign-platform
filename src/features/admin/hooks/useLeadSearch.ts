"use client";

import { useEffect, useState } from "react";
import {
  type LeadRow,
  type LeadSortDirection,
  type LeadSortField,
  searchLeads,
} from "../services/searchLeads";

const DEFAULT_PAGE_SIZE = 20;

export interface LeadSearchState {
  items: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  sortBy: LeadSortField;
  sortDirection: LeadSortDirection;
  isLoading: boolean;
  errorMessage: string | null;
}

export interface LeadSearchActions {
  setQuery: (query: string) => void;
  setPage: (page: number) => void;
  toggleSort: (field: LeadSortField) => void;
}

/**
 * Drives the admin lead search table: query text, pagination, and
 * sorting, refetching `GET /api/admin/leads` whenever any of them change.
 * Changing the search query or the sort field always resets back to page
 * 1, so the visible page always matches the current filter/sort.
 */
export function useLeadSearch(): LeadSearchState & LeadSearchActions {
  const [query, setQueryState] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<LeadSortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<LeadSortDirection>("desc");
  const [items, setItems] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    searchLeads({
      query: query || undefined,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      sortBy,
      sortDirection,
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
  }, [query, page, sortBy, sortDirection]);

  function setQuery(nextQuery: string): void {
    setQueryState(nextQuery);
    setPage(1);
  }

  function toggleSort(field: LeadSortField): void {
    setPage(1);
    if (field === sortBy) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDirection("asc");
    }
  }

  return {
    items,
    total,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    query,
    sortBy,
    sortDirection,
    isLoading,
    errorMessage,
    setQuery,
    setPage,
    toggleSort,
  };
}
