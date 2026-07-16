"use client";

import Link from "next/link";
import { useSongsList } from "../hooks/useSongsList";
import { ResendEmailAction } from "./ResendEmailAction";

const STATUS_LABEL_ES: Record<string, string> = {
  QUEUED: "En cola",
  GENERATING: "Generando",
  COMPLETED: "Completada",
  FAILED: "Fallida",
};

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
 */
export function SongsList() {
  const { items, isLoading, errorMessage, refetch } = useSongsList();

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
    return <p className="text-sm text-muted-foreground">Aún no se ha generado ninguna canción.</p>;
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
          </tr>
        </thead>
        <tbody>
          {items.map((song) => (
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
