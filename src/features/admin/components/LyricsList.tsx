"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { useLyricsList } from "../hooks/useLyricsList";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("es-MX");
}

/**
 * Sprint ADMIN-1 — Backoffice de Campaña. The "Letras" list: familia,
 * estilo, versión, estado, fecha — read-only.
 *
 * Sprint FINAL-1 — Production Hardening: added free-text search and
 * pagination — a hard-capped, unfiltered list of 200 stopped being
 * usable once the campaign passes that many leads.
 */
export function LyricsList() {
  const { items, total, page, pageSize, query, isLoading, errorMessage, setQuery, setPage } =
    useLyricsList();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border p-3">
        <Input
          type="search"
          placeholder="Buscar por familia o bebé..."
          aria-label="Buscar letras"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-sm"
        />
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
                Estilo
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Versión
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Estado
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Fecha
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                  Cargando...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                  No se encontraron letras.
                </td>
              </tr>
            ) : (
              items.map((entry) => (
                <tr key={entry.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/admin/leads/${entry.leadId}`} className="text-primary underline">
                      {entry.parentName} · {entry.babyName}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{entry.moodName}</td>
                  <td className="px-3 py-2">{entry.version}</td>
                  <td className="px-3 py-2">
                    {entry.approved ? "Aprobada" : (entry.rejectionReason ?? "No aprobada")}
                  </td>
                  <td className="px-3 py-2">{formatDate(entry.createdAt)}</td>
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
