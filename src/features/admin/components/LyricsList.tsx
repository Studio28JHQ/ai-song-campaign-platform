"use client";

import Link from "next/link";
import { useLyricsList } from "../hooks/useLyricsList";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("es-MX");
}

/** Sprint ADMIN-1 — Backoffice de Campaña. The "Letras" list: familia, estilo, versión, estado, fecha — read-only. */
export function LyricsList() {
  const { items, isLoading, errorMessage } = useLyricsList();

  if (isLoading) {
    return <p className="text-body text-muted-foreground">Cargando...</p>;
  }

  if (errorMessage) {
    return (
      <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {errorMessage}
      </p>
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Aún no se ha generado ninguna letra.</p>;
  }

  return (
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
          {items.map((entry) => (
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
