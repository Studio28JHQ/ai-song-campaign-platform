"use client";

import { useEffect, useState } from "react";
import type {
  LeadEmailStatusFilter,
  LeadFilterCriteria,
  LeadSongStatusFilter,
} from "../services/leadFilters";
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
  dateFrom: string;
  dateTo: string;
  songStatus: LeadSongStatusFilter | "";
  emailStatus: LeadEmailStatusFilter | "";
  city: string;
  sortBy: LeadSortField;
  sortDirection: LeadSortDirection;
  isLoading: boolean;
  errorMessage: string | null;
}

export interface LeadSearchActions {
  setQuery: (query: string) => void;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  setSongStatus: (value: LeadSongStatusFilter | "") => void;
  setEmailStatus: (value: LeadEmailStatusFilter | "") => void;
  setCity: (value: string) => void;
  setPage: (page: number) => void;
  toggleSort: (field: LeadSortField) => void;
  /** The current filter criteria, in the shape the CSV export URL builder expects. */
  currentFilters: LeadFilterCriteria;
}

/**
 * Drives the admin lead search table: query text, date range, song
 * status, email status, city, pagination, and sorting — refetching
 * `GET /api/admin/leads` whenever any of them change. Filters always
 * combine with the free-text search (see docs/Product/User_Flow.md —
 * Search, Filters). Changing any filter or the sort field always resets
 * back to page 1.
 */
export function useLeadSearch(): LeadSearchState & LeadSearchActions {
  const [query, setQueryState] = useState("");
  const [dateFrom, setDateFromState] = useState("");
  const [dateTo, setDateToState] = useState("");
  const [songStatus, setSongStatusState] = useState<LeadSongStatusFilter | "">("");
  const [emailStatus, setEmailStatusState] = useState<LeadEmailStatusFilter | "">("");
  const [city, setCityState] = useState("");
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
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      songStatus: songStatus || undefined,
      emailStatus: emailStatus || undefined,
      city: city || undefined,
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
  }, [query, dateFrom, dateTo, songStatus, emailStatus, city, page, sortBy, sortDirection]);

  function setQuery(nextQuery: string): void {
    setQueryState(nextQuery);
    setPage(1);
  }

  function setDateFrom(value: string): void {
    setDateFromState(value);
    setPage(1);
  }

  function setDateTo(value: string): void {
    setDateToState(value);
    setPage(1);
  }

  function setSongStatus(value: LeadSongStatusFilter | ""): void {
    setSongStatusState(value);
    setPage(1);
  }

  function setEmailStatus(value: LeadEmailStatusFilter | ""): void {
    setEmailStatusState(value);
    setPage(1);
  }

  function setCity(value: string): void {
    setCityState(value);
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
    dateFrom,
    dateTo,
    songStatus,
    emailStatus,
    city,
    sortBy,
    sortDirection,
    isLoading,
    errorMessage,
    setQuery,
    setDateFrom,
    setDateTo,
    setSongStatus,
    setEmailStatus,
    setCity,
    setPage,
    toggleSort,
    currentFilters: {
      query: query || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      songStatus: songStatus || undefined,
      emailStatus: emailStatus || undefined,
      city: city || undefined,
    },
  };
}
