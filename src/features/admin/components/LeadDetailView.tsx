"use client";

import { buttonVariants } from "@/components/ui/button";
import { useLeadDetail } from "../hooks/useLeadDetail";
import { ResendEmailAction } from "./ResendEmailAction";
import { RetrySongAction } from "./RetrySongAction";

interface LeadDetailViewProps {
  leadId: string;
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatTimestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString("es-MX") : "—";
}

/**
 * The read-only Lead Detail screen (see docs/Product/User_Flow.md):
 * lead information, lyrics history, the approved version, song
 * status/audio/download, generation timestamps, email delivery status,
 * and the complete execution history — presented as a timeline (Sprint
 * ADMIN-1). The only interactive controls are the two operational
 * recovery actions — Retry Generation (only for a `FAILED` song) and
 * Resend Email (only for a `COMPLETED` song whose automatic email has
 * already gone out) — everything else on this screen is strictly
 * read-only.
 */
export function LeadDetailView({ leadId }: LeadDetailViewProps) {
  const { detail, isLoading, notFound, errorMessage, refetch } = useLeadDetail(leadId);

  if (isLoading) {
    return <p className="text-body text-muted-foreground">Cargando...</p>;
  }

  if (notFound) {
    return (
      <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        No se encontró esta familia.
      </p>
    );
  }

  if (errorMessage || !detail) {
    return (
      <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {errorMessage ?? "Algo salió mal."}
      </p>
    );
  }

  const { lead, lyricsHistory, approvedLyrics, song, executionHistory } = detail;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className="text-title font-semibold text-foreground">Información de la familia</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Nombre</dt>
            <dd>{lead.parentName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Bebé</dt>
            <dd>{lead.babyName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Correo</dt>
            <dd>{lead.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Teléfono</dt>
            <dd>{lead.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Ciudad</dt>
            <dd>{lead.city ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Estado</dt>
            <dd>{lead.status}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Registrado</dt>
            <dd>{formatTimestamp(lead.createdAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-title font-semibold text-foreground">Historial de letras</h2>
        {lyricsHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no se ha generado ninguna letra.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {lyricsHistory.map((version) => (
              <li key={version.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="mb-1 flex items-center justify-between text-muted-foreground">
                  <span>Versión {version.version}</span>
                  <span>
                    {version.approved ? "Aprobada" : (version.rejectionReason ?? "No aprobada")}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap text-foreground">{version.content}</pre>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-title font-semibold text-foreground">Letra aprobada</h2>
        {approvedLyrics ? (
          <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground">
            {approvedLyrics.content}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">Aún no hay una letra aprobada.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-title font-semibold text-foreground">Canción</h2>
        {song ? (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              <span className="text-muted-foreground">Estado: </span>
              {song.status}
            </p>
            <p>
              <span className="text-muted-foreground">Generada el: </span>
              {formatTimestamp(song.generatedAt)}
            </p>
            <p>
              <span className="text-muted-foreground">Entrega por correo: </span>
              {song.emailedAt ? `Enviado el ${formatTimestamp(song.emailedAt)}` : "No enviado"}
            </p>

            {song.audioUrl ? (
              <>
                <audio controls src={song.audioUrl} className="w-full max-w-sm" />
                {song.duration ? (
                  <p className="text-muted-foreground">Duración: {formatDuration(song.duration)}</p>
                ) : null}
                <a
                  href={song.audioUrl}
                  download
                  className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}
                >
                  Descargar canción
                </a>
              </>
            ) : null}

            {song.status === "FAILED" ? (
              <RetrySongAction songId={song.id} onSuccess={refetch} />
            ) : null}

            {song.status === "COMPLETED" && song.emailedAt ? (
              <ResendEmailAction songId={song.id} onSuccess={refetch} />
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aún no se ha generado ninguna canción.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-title font-semibold text-foreground">Línea de tiempo</h2>
        {executionHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay historial.</p>
        ) : (
          <ol className="flex flex-col gap-0">
            {executionHistory.map((item, index) => (
              <li
                key={`${item.type}-${item.timestamp}-${index}`}
                className="relative flex gap-3 pb-5 pl-1 last:pb-0"
              >
                <span aria-hidden className="flex flex-col items-center">
                  <span className="mt-1 size-2.5 shrink-0 rounded-full bg-primary" />
                  {index < executionHistory.length - 1 ? (
                    <span className="w-px flex-1 bg-border" />
                  ) : null}
                </span>
                <div className="flex flex-1 flex-col gap-0.5 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium text-foreground">
                      {item.label}
                      {item.actor ? (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          — por {item.actor}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground">{formatTimestamp(item.timestamp)}</span>
                  </div>
                  {item.detail ? (
                    <span className="text-muted-foreground">{item.detail}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
