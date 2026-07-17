"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSongsList } from "../hooks/useSongsList";
import { ResendEmailAction } from "./ResendEmailAction";
import { RetrySongAction } from "./RetrySongAction";

const STATUS_LABEL_ES: Record<string, string> = {
  QUEUED: "En cola",
  GENERATING: "Generando",
  COMPLETED: "Completada",
  FAILED: "Fallida",
};

const STATUS_OPTIONS = [
  { value: "", label: "Cualquier estado" },
  { value: "QUEUED", label: "En cola" },
  { value: "GENERATING", label: "Generando" },
  { value: "COMPLETED", label: "Completada" },
  { value: "FAILED", label: "Fallida" },
] as const;

function formatDate(value: string): string {
  return new Date(value).toLocaleString("es-MX");
}

/**
 * Sprint ADMIN-1 — Backoffice de Campaña. The "Canciones" list:
 * estado, proveedor, fecha, escuchar, descargar, reenviar correo. Read
 * URLs are the same freshly signed URL `ListSongsUseCase` resolves —
 * never a stored one. "Reenviar correo" reuses the exact same
 * `ResendEmailAction` the Lead Detail screen already uses, not a
 * second implementation.
 *
 * Sprint FINAL-1 — Production Hardening: added free-text search,
 * status filter, pagination (a hard-capped, unfiltered list stopped
 * being usable for triaging failures at 3,000 songs), the provider's
 * failure reason for a `FAILED` row, and a "Reintentar" action reusing
 * the exact same `RetrySongAction` the Lead Detail screen already uses
 * — an operator no longer has to find the specific lead to retry a
 * failed song.
 */
export function SongsList() {
  const {
    items,
    total,
    page,
    pageSize,
    query,
    status,
    isLoading,
    errorMessage,
    setQuery,
    setStatus,
    setPage,
    refetch,
  } = useSongsList();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <Input
          type="search"
          placeholder="Buscar por familia o bebé..."
          aria-label="Buscar canciones"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-sm"
        />

        <div className="flex flex-col gap-1 sm:max-w-xs">
          <Label htmlFor="filter-song-status">Estado</Label>
          <select
            id="filter-song-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as Parameters<typeof setStatus>[0])}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
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
              <th scope="col" className="px-3 py-2 font-medium">
                Familia
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Estado
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Proveedor
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Fecha
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Escuchar
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Descargar
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Correo
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Error
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-center text-muted-foreground">
                  Cargando...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-center text-muted-foreground">
                  No se encontraron canciones.
                </td>
              </tr>
            ) : (
              items.map((song) => (
                <tr key={song.id} className="border-b border-border last:border-0 align-top">
                  <td className="px-3 py-2">
                    <Link href={`/admin/leads/${song.leadId}`} className="text-primary underline">
                      {song.parentName} · {song.babyName}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{STATUS_LABEL_ES[song.status] ?? song.status}</td>
                  <td className="px-3 py-2">{song.provider}</td>
                  <td className="px-3 py-2">{formatDate(song.createdAt)}</td>
                  <td className="px-3 py-2">
                    {song.audioUrl ? (
                      <audio controls src={song.audioUrl} className="h-8 max-w-[180px]" />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {song.audioUrl ? (
                      <a href={song.audioUrl} download className="text-primary underline">
                        Descargar
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {song.status === "COMPLETED" && song.emailedAt ? (
                      <ResendEmailAction songId={song.id} onSuccess={refetch} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-[220px] px-3 py-2 text-destructive">
                    {song.providerError ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {song.status === "FAILED" ? (
                      <RetrySongAction songId={song.id} onSuccess={refetch} />
                    ) : (
                      "—"
                    )}
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
