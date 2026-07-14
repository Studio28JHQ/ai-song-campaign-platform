"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { useLeadSearch } from "../hooks/useLeadSearch";
import type { LeadSortField } from "../services/searchLeads";

const COLUMNS: Array<{ field: LeadSortField; label: string }> = [
  { field: "createdAt", label: "Created" },
  { field: "parentName", label: "Parent" },
  { field: "babyName", label: "Baby" },
  { field: "email", label: "Email" },
  { field: "songStatus", label: "Song Status" },
];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

/**
 * The searchable, sortable, paginated participants table on the Admin
 * Dashboard (see docs/Product/User_Flow.md — Search). Read-only: every
 * row only ever links to the read-only Lead Detail screen — there is no
 * inline editing anywhere in this table.
 */
export function LeadSearchTable() {
  const {
    items,
    total,
    page,
    pageSize,
    query,
    sortBy,
    sortDirection,
    isLoading,
    errorMessage,
    setQuery,
    setPage,
    toggleSort,
  } = useLeadSearch();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-4">
      <Input
        type="search"
        placeholder="Search by parent name, baby name, email, or phone..."
        aria-label="Search participants"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="max-w-sm"
      />

      {errorMessage ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="border-b border-border bg-muted/30">
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.field} scope="col" className="px-3 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort(column.field)}
                    className="flex items-center gap-1"
                  >
                    {column.label}
                    {sortBy === column.field ? (sortDirection === "asc" ? "↑" : "↓") : null}
                  </button>
                </th>
              ))}
              <th scope="col" className="px-3 py-2 font-medium">
                Email Status
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + 2}
                  className="px-3 py-4 text-center text-muted-foreground"
                >
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + 2}
                  className="px-3 py-4 text-center text-muted-foreground"
                >
                  No participants found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{formatDate(item.createdAt)}</td>
                  <td className="px-3 py-2">{item.parentName}</td>
                  <td className="px-3 py-2">{item.babyName}</td>
                  <td className="px-3 py-2">{item.email}</td>
                  <td className="px-3 py-2">{item.songStatus ?? "—"}</td>
                  <td className="px-3 py-2">{item.emailSent ? "Sent" : "Not sent"}</td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/leads/${item.id}`} className="text-primary underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {page} of {totalPages} ({total} total)
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-md border border-border px-2 py-1 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="rounded-md border border-border px-2 py-1 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
