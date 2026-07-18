"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLyricsList } from "../hooks/useLyricsList";
import { EmptyState } from "./EmptyState";
import { ErrorMessage } from "./ErrorMessage";
import { StatusBadge } from "./StatusBadge";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("es-MX");
}

function LyricsStatusBadge({
  approved,
  rejectionReason,
}: {
  approved: boolean;
  rejectionReason: string | null;
}) {
  if (approved) return <StatusBadge label="Aprobada" variant="success" />;
  if (rejectionReason) return <StatusBadge label={rejectionReason} variant="destructive" />;
  return <StatusBadge label="No aprobada" variant="muted" />;
}

/**
 * Sprint ADMIN-1 — Backoffice de Campaña. The "Letras" list: familia,
 * estilo, versión, estado, fecha — read-only.
 *
 * Sprint FINAL-1 — Production Hardening: added free-text search and
 * pagination — a hard-capped, unfiltered list of 200 stopped being
 * usable once the campaign passes that many leads.
 *
 * Sprint FINAL-3 — Dashboard Stabilization: status is now a badge,
 * table gained a sticky header, taller rows, hover states, a skeleton
 * loading state, and a branded empty state.
 */
export function LyricsList() {
  const { items, total, page, pageSize, query, isLoading, errorMessage, setQuery, setPage } =
    useLyricsList();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <Input
          type="search"
          placeholder="Buscar por familia o bebé..."
          aria-label="Buscar letras"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-sm"
        />
      </div>

      {errorMessage ? <ErrorMessage message={errorMessage} /> : null}

      {isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Cargando letras">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-11 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No se encontraron letras"
          description="Ajusta la búsqueda e inténtalo de nuevo."
        />
      ) : (
        <div className="max-h-[32rem] overflow-auto rounded-xl border border-border shadow-sm">
          <table className="w-full min-w-max text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Familia
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Estilo
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Versión
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Fecha
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-muted/50"
                >
                  <td className="px-4 py-3">
                    <Link href={`/admin/leads/${entry.leadId}`} className="text-primary underline">
                      {entry.parentName} · {entry.babyName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{entry.moodName}</td>
                  <td className="px-4 py-3">{entry.version}</td>
                  <td className="px-4 py-3">
                    <LyricsStatusBadge
                      approved={entry.approved}
                      rejectionReason={entry.rejectionReason}
                    />
                  </td>
                  <td className="px-4 py-3">{formatDate(entry.createdAt)}</td>
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
