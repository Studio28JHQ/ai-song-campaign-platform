"use client";

import { Cookie } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConsentsList } from "../hooks/useConsentsList";
import { buildConsentsExportUrl } from "../services/consents";
import { EmptyState } from "./EmptyState";
import { ErrorMessage } from "./ErrorMessage";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("es-MX");
}

/**
 * Feature 1 — Consent Management Screen. The "Consentimientos" list:
 * the latest 20 `Consent` records, every stored field, plus the
 * associated Lead (when one exists) read through the existing
 * `Consent → Lead` relationship — no additional persistence, no
 * pagination/search (not requested for this screen; see
 * `GET /api/admin/consents/export` for the full, unfiltered table as
 * CSV). Follows the same sticky-header/skeleton/empty-state table shell
 * `LyricsList`/`SongsList` already use.
 */
export function ConsentsList() {
  const { items, isLoading, errorMessage } = useConsentsList();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Mostrando los 20 consentimientos más recientes.
        </p>
        <a
          href={buildConsentsExportUrl()}
          className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}
        >
          Descargar CSV
        </a>
      </div>

      {errorMessage ? <ErrorMessage message={errorMessage} /> : null}

      {isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Cargando consentimientos">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-11 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Cookie}
          title="Aún no hay consentimientos registrados"
          description="Aparecerán aquí en cuanto un visitante acepte el aviso de privacidad."
        />
      ) : (
        <div className="max-h-[32rem] overflow-auto rounded-xl border border-border shadow-sm">
          <table className="w-full min-w-max text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  ID
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Session ID
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Lead ID
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Familia
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  IP
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  User Agent
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Versión de política
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Aceptado
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Creado
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Actualizado
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-muted/50"
                >
                  <td
                    className="max-w-[10rem] truncate px-4 py-3 font-mono text-xs"
                    title={entry.id}
                  >
                    {entry.id}
                  </td>
                  <td
                    className="max-w-[10rem] truncate px-4 py-3 font-mono text-xs"
                    title={entry.sessionId}
                  >
                    {entry.sessionId}
                  </td>
                  <td
                    className="max-w-[10rem] truncate px-4 py-3 font-mono text-xs"
                    title={entry.leadId ?? undefined}
                  >
                    {entry.leadId ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {entry.leadId && entry.lead ? (
                      <Link
                        href={`/admin/leads/${entry.leadId}`}
                        className="text-primary underline"
                      >
                        {entry.lead.parentName} · {entry.lead.babyName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">{entry.ipAddress}</td>
                  <td className="max-w-[14rem] truncate px-4 py-3" title={entry.userAgent}>
                    {entry.userAgent}
                  </td>
                  <td className="px-4 py-3">{entry.policyVersion}</td>
                  <td className="px-4 py-3">{formatDate(entry.acceptedAt)}</td>
                  <td className="px-4 py-3">{formatDate(entry.createdAt)}</td>
                  <td className="px-4 py-3">{formatDate(entry.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
