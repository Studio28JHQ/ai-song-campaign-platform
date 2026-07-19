"use client";

import { CheckCircle2, Clock3, FileText, Mic2, Music, User } from "lucide-react";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLeadDetail } from "../hooks/useLeadDetail";
import { EmptyState } from "./EmptyState";
import { ErrorMessage } from "./ErrorMessage";
import { ResendEmailAction } from "./ResendEmailAction";
import { RetrySongAction } from "./RetrySongAction";
import { SectionHeader } from "./SectionHeader";
import { LeadStatusBadge, SongStatusBadge } from "./StatusBadge";

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

/** Sprint FINAL-3 — Dashboard Stabilization. The card shell every Lead Detail section shares — consistent spacing, radius, and shadow. */
function DetailCard({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      {children}
    </section>
  );
}

function LeadDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Cargando ficha de familia">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-32 rounded-xl" />
      ))}
    </div>
  );
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
 *
 * Sprint FINAL-3 — Dashboard Stabilization: every section is now its
 * own card, the approved lyrics and the generated song are visually
 * highlighted (a tinted border/background, not new colors — the same
 * `success`/`primary` tokens used elsewhere), and the timeline reads
 * more clearly. All the same information as before, presentation only.
 */
export function LeadDetailView({ leadId }: LeadDetailViewProps) {
  const { detail, isLoading, notFound, errorMessage, refetch } = useLeadDetail(leadId);

  if (isLoading) {
    return <LeadDetailSkeleton />;
  }

  if (notFound) {
    return <ErrorMessage message="No se encontró esta familia." />;
  }

  if (errorMessage || !detail) {
    return <ErrorMessage message={errorMessage ?? "Algo salió mal. Inténtalo de nuevo."} />;
  }

  const { lead, lyricsHistory, approvedLyrics, song, executionHistory } = detail;

  return (
    <div className="flex flex-col gap-6">
      <DetailCard>
        <div className="flex items-center justify-between">
          <SectionHeader icon={User} title="Información de la familia" />
          <LeadStatusBadge status={lead.status} />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-label text-muted-foreground">Nombre</dt>
            <dd className="text-foreground">{lead.parentName}</dd>
          </div>
          <div>
            <dt className="text-label text-muted-foreground">Bebé</dt>
            <dd className="text-foreground">{lead.babyName}</dd>
          </div>
          <div>
            <dt className="text-label text-muted-foreground">Edad del bebé</dt>
            <dd className="text-foreground">
              {lead.babyAge != null ? `${lead.babyAge} meses` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-label text-muted-foreground">Correo</dt>
            <dd className="text-foreground">{lead.email}</dd>
          </div>
          <div>
            <dt className="text-label text-muted-foreground">Teléfono</dt>
            <dd className="text-foreground">{lead.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-label text-muted-foreground">Ciudad</dt>
            <dd className="text-foreground">{lead.city ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-label text-muted-foreground">Registrado</dt>
            <dd className="text-foreground">{formatTimestamp(lead.createdAt)}</dd>
          </div>
        </dl>
      </DetailCard>

      <DetailCard>
        <SectionHeader icon={FileText} title="Historial de letras" />
        {lyricsHistory.length === 0 ? (
          <EmptyState icon={FileText} title="Aún no se ha generado ninguna letra" />
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
      </DetailCard>

      <DetailCard>
        <SectionHeader icon={Mic2} title="Letra aprobada" />
        {approvedLyrics ? (
          <pre className="whitespace-pre-wrap rounded-lg border border-success/30 bg-success/5 p-4 text-sm text-foreground">
            {approvedLyrics.content}
          </pre>
        ) : (
          <EmptyState icon={Mic2} title="Aún no hay una letra aprobada" />
        )}
      </DetailCard>

      <DetailCard>
        <SectionHeader icon={Music} title="Canción" />
        {song ? (
          <div
            className={`flex flex-col gap-3 rounded-lg border p-4 text-sm ${
              song.status === "COMPLETED"
                ? "border-success/30 bg-success/5"
                : "border-border bg-muted/30"
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <SongStatusBadge status={song.status} />
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock3 className="size-3.5" />
                Generada el {formatTimestamp(song.generatedAt)}
              </span>
            </div>
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
          <EmptyState icon={Music} title="Aún no se ha generado ninguna canción" />
        )}
      </DetailCard>

      <DetailCard>
        <SectionHeader icon={CheckCircle2} title="Línea de tiempo" />
        {executionHistory.length === 0 ? (
          <EmptyState icon={Clock3} title="Aún no hay historial" />
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
                <div className="flex flex-1 flex-col gap-0.5 rounded-lg px-2 py-1 text-sm transition-colors hover:bg-muted/50">
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
                    <span className="text-label text-muted-foreground">
                      {formatTimestamp(item.timestamp)}
                    </span>
                  </div>
                  {item.detail ? (
                    <span className="text-muted-foreground">{item.detail}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </DetailCard>
    </div>
  );
}
