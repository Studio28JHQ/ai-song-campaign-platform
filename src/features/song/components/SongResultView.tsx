"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { useSongResult } from "../hooks/useSongResult";

interface SongResultViewProps {
  supportEmail: string;
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

/**
 * The Song Result page's full experience: reads the current Song state
 * once via `useSongResult`, then renders the waiting, completed, or
 * failed view. Approving lyrics queues the song job server-side (see
 * PROJECT_MANIFEST.md — Architecture exception, Sprint 7.5) and the
 * parent is notified by email once it's ready — this page never polls.
 * The user can only ever generate one final song (see
 * docs/Product/Business_Rules.md), so "Generate Another Song" is always
 * shown disabled rather than omitted.
 */
export function SongResultView({ supportEmail }: SongResultViewProps) {
  const { babyName, status, audioUrl, duration, loading } = useSongResult();
  const title = babyName ? `La canción de ${babyName}` : "Tu canción";

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          role="status"
          aria-label="Cargando"
          className="size-10 animate-spin rounded-full border-4 border-muted border-t-primary"
        />
      </div>
    );
  }

  if (status === "FAILED") {
    return (
      <div className="flex flex-col items-center gap-5 rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="font-heading text-heading font-semibold text-foreground">{title}</h1>
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          No pudimos crear tu canción en este momento. Por favor contáctanos en{" "}
          <a href={`mailto:${supportEmail}`} className="underline">
            {supportEmail}
          </a>{" "}
          para ayudarte.
        </p>
        <Button type="button" disabled className="w-full rounded-full sm:w-auto">
          Crear otra canción
        </Button>
      </div>
    );
  }

  if (status === "COMPLETED") {
    const formattedDuration = formatDuration(duration);

    return (
      <div className="flex flex-col items-center gap-5 rounded-3xl border border-border bg-gradient-to-b from-secondary/50 to-card p-8 text-center shadow-sm">
        <span aria-hidden className="text-4xl">
          🎉
        </span>
        <h1 className="font-heading text-heading font-semibold text-foreground">{title}</h1>
        <p className="text-body text-muted-foreground">¡Tu canción personalizada está lista!</p>

        {audioUrl ? (
          <audio controls src={audioUrl} className="w-full max-w-sm">
            Tu navegador no admite el elemento de audio.
          </audio>
        ) : null}

        {formattedDuration ? (
          <p className="text-caption text-muted-foreground">Duración: {formattedDuration}</p>
        ) : null}

        {audioUrl ? (
          <a
            href={audioUrl}
            download
            className={buttonVariants({
              variant: "default",
              className: "rounded-full bg-accent text-accent-foreground hover:bg-accent/85",
            })}
          >
            Descargar canción
          </a>
        ) : null}

        <p className="text-caption text-muted-foreground">
          Comparte la alegría — ¡cuéntales a tus amigos y familia sobre {title}!
        </p>

        <Button type="button" disabled className="w-full rounded-full sm:w-auto">
          Crear otra canción
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
      <h1 className="font-heading text-heading font-semibold text-foreground">{title}</h1>
      <div
        role="status"
        aria-label="Tu canción está en producción"
        className="size-10 animate-spin rounded-full border-4 border-muted border-t-primary"
      />
      <p className="text-body text-muted-foreground">
        Tu letra fue aprobada. Tu canción está en producción. Te avisaremos por correo en cuanto
        esté lista.
      </p>
      <Button type="button" disabled className="w-full rounded-full sm:w-auto">
        Crear otra canción
      </Button>
    </div>
  );
}
