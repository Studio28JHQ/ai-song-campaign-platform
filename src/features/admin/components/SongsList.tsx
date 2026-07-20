"use client";

import Link from "next/link";
import { Music } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useSongsList } from "../hooks/useSongsList";
import { EmptyState } from "./EmptyState";
import { ErrorMessage } from "./ErrorMessage";
import { ResendEmailAction } from "./ResendEmailAction";
import { RetrySongAction } from "./RetrySongAction";
import { SongStatusBadge } from "./StatusBadge";

/** Copies the already-resolved signed URL to the clipboard — never re-resolves or persists it. */
function CopyUrlButton({ audioUrl }: { audioUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(audioUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser — silently no-op, same as any other best-effort UI affordance.
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
      {copied ? "¡Copiado!" : "Copiar URL"}
    </Button>
  );
}

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
 * estado, estilo, fecha, escuchar, descargar, reenviar correo. Read
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
 *
 * Sprint FINAL-3 — Dashboard Stabilization: status badges now go
 * through the shared `SongStatusBadge` (standardized variant mapping),
 * and the table gained a sticky header, taller rows, hover states, a
 * skeleton loading state, and a branded empty state.
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
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
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

      {errorMessage ? <ErrorMessage message={errorMessage} /> : null}

      {isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Cargando canciones">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Music}
          title="No se encontraron canciones"
          description="Ajusta la búsqueda o el filtro de estado e inténtalo de nuevo."
        />
      ) : (
        <div className="max-h-[36rem] overflow-auto rounded-xl border border-border shadow-sm">
          <table className="w-full min-w-max text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Familia
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Estilo
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Fecha
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Escuchar
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Descargar
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  URL firmada
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Correo
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Error
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((song) => (
                <tr
                  key={song.id}
                  className="border-b border-border align-top transition-colors last:border-0 hover:bg-muted/50"
                >
                  <td className="px-4 py-3">
                    <Link href={`/admin/leads/${song.leadId}`} className="text-primary underline">
                      {song.parentName} · {song.babyName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <SongStatusBadge status={song.status} />
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3">{song.musicDirection ?? "—"}</td>
                  <td className="px-4 py-3">{formatDate(song.createdAt)}</td>
                  <td className="px-4 py-3">
                    {song.audioUrl ? (
                      <audio controls src={song.audioUrl} className="h-8 max-w-[180px]" />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {song.audioUrl ? (
                      <a href={song.audioUrl} download className="text-primary underline">
                        Descargar
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {song.audioUrl ? <CopyUrlButton audioUrl={song.audioUrl} /> : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {song.status === "COMPLETED" && song.emailedAt ? (
                      <ResendEmailAction songId={song.id} onSuccess={refetch} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-[220px] px-4 py-3 text-destructive">
                    {song.providerError ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {song.status === "FAILED" ? (
                      <RetrySongAction songId={song.id} onSuccess={refetch} />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Página {page} de {totalPages} ({total} en total)
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
