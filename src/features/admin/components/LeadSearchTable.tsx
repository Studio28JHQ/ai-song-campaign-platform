"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { useLeadSearch } from "../hooks/useLeadSearch";
import { buildLeadsExportUrl } from "../services/exportLeadsCsv";
import type { LeadSortField } from "../services/searchLeads";

const COLUMNS: Array<{ field: LeadSortField; label: string }> = [
  { field: "createdAt", label: "Registro" },
  { field: "parentName", label: "Familia" },
  { field: "babyName", label: "Bebé" },
  { field: "email", label: "Correo" },
  { field: "songStatus", label: "Estado de la canción" },
];

const SONG_STATUS_OPTIONS = [
  { value: "", label: "Cualquier estado" },
  { value: "QUEUED", label: "En cola" },
  { value: "GENERATING", label: "Generando" },
  { value: "COMPLETED", label: "Completada" },
  { value: "FAILED", label: "Fallida" },
  { value: "NONE", label: "Sin canción aún" },
] as const;

const EMAIL_STATUS_OPTIONS = [
  { value: "", label: "Cualquier estado" },
  { value: "SENT", label: "Enviado" },
  { value: "NOT_SENT", label: "No enviado" },
] as const;

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

/**
 * The searchable, sortable, filterable, paginated participants table on
 * the Admin Dashboard (see docs/Product/User_Flow.md — Search, Filters,
 * Export). Read-only: every row only ever links to the read-only Lead
 * Detail screen — there is no inline editing anywhere in this table. The
 * "Export CSV" link always reflects the currently applied filters.
 */
export function LeadSearchTable() {
  const {
    items,
    total,
    page,
    pageSize,
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
    currentFilters,
  } = useLeadSearch();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <Input
          type="search"
          placeholder="Buscar por nombre, correo o teléfono..."
          aria-label="Buscar familias"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-sm"
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="filter-date-from">Desde</Label>
            <Input
              id="filter-date-from"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="filter-date-to">Hasta</Label>
            <Input
              id="filter-date-to"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="filter-song-status">Estado</Label>
            <select
              id="filter-song-status"
              value={songStatus}
              onChange={(event) =>
                setSongStatus(event.target.value as Parameters<typeof setSongStatus>[0])
              }
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              {SONG_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="filter-email-status">Correo</Label>
            <select
              id="filter-email-status"
              value={emailStatus}
              onChange={(event) =>
                setEmailStatus(event.target.value as Parameters<typeof setEmailStatus>[0])
              }
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              {EMAIL_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="filter-city">Ciudad</Label>
            <Input
              id="filter-city"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Ej. Guadalajara"
            />
          </div>
        </div>

        <a
          href={buildLeadsExportUrl(currentFilters)}
          className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}
        >
          Exportar CSV
        </a>
      </div>

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
                Estado del correo
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Acciones
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
                  Cargando...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + 2}
                  className="px-3 py-4 text-center text-muted-foreground"
                >
                  No se encontraron familias.
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
                  <td className="px-3 py-2">{item.emailSent ? "Enviado" : "No enviado"}</td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/leads/${item.id}`} className="text-primary underline">
                      Ver
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
          Página {page} de {totalPages} ({total} en total)
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-md border border-border px-2 py-1 disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="rounded-md border border-border px-2 py-1 disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
