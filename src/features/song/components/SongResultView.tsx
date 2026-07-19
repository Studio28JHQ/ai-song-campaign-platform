"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSongResult } from "../hooks/useSongResult";

/** How long the "song in production" waiting view stays up before it auto-redirects home — no user interaction required. */
const PRODUCTION_REDIRECT_DELAY_MS = 10_000;

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
 * docs/Product/Business_Rules.md): the transient waiting view has no
 * "Generate Another Song" affordance at all (it would be misleading —
 * there is nothing else to generate) and auto-redirects home after
 * `PRODUCTION_REDIRECT_DELAY_MS`; COMPLETED/FAILED still show it
 * disabled, since a parent needs to actually see/act on that content
 * first.
 */
export function SongResultView({ supportEmail }: SongResultViewProps) {
  const router = useRouter();
  const { babyName, status, audioUrl, duration, loading } = useSongResult();
  const title = babyName ? `La canción de ${babyName}` : "Tu canción";
  const displayBabyName = babyName ?? "tu bebé";

  // The "song in production" view (the only state this page auto-leaves —
  // COMPLETED and FAILED both need the parent to actually see/act on
  // their content) has nothing further for the parent to do here; the
  // page never polls (see `useSongResult`), so once this state is
  // reached it won't change again during this visit.
  const isProducing = !loading && status !== "COMPLETED" && status !== "FAILED";

  useEffect(() => {
    if (!isProducing) return;

    const timeout = setTimeout(() => {
      router.replace("/");
    }, PRODUCTION_REDIRECT_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [isProducing, router]);

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
      <div className="flex flex-col items-center gap-5 rounded-[24px] border border-border bg-card shadow-[0_8px_30px_rgba(139,92,246,0.08)] p-8 text-center">
        <h1 className="font-heading text-heading font-bold text-foreground">{title}</h1>
        <p
          role="alert"
          className="rounded-lg border-l-4 border-destructive bg-[var(--destructive-background)] px-3 py-2 text-sm text-foreground"
        >
          No pudimos crear tu canción en este momento. Por favor contáctanos en{" "}
          <a href={`mailto:${supportEmail}`} className="underline">
            {supportEmail}
          </a>{" "}
          para ayudarte.
        </p>
        <Button
          type="button"
          disabled
          className="h-12 w-full rounded-full border-2 border-primary bg-card px-8 text-base font-semibold text-primary sm:w-auto"
        >
          Crear otra canción
        </Button>
      </div>
    );
  }

  if (status === "COMPLETED") {
    const formattedDuration = formatDuration(duration);

    return (
      <div className="flex flex-col items-center gap-5 rounded-[24px] border border-border bg-gradient-to-b from-secondary/50 to-card shadow-[0_8px_30px_rgba(139,92,246,0.08)] p-8 text-center">
        <span aria-hidden className="text-4xl">
          🎉
        </span>
        <h1 className="font-heading text-heading font-bold text-foreground">{title}</h1>
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
              className:
                "h-12 rounded-full px-8 text-base font-semibold shadow-md shadow-primary/25 hover:bg-[var(--primary-hover)]",
            })}
          >
            Descargar canción
          </a>
        ) : null}

        <p className="text-caption text-muted-foreground">
          También te la enviamos a tu correo, por si quieres volver a escucharla más tarde.
        </p>

        <p className="text-caption text-muted-foreground">
          Comparte la alegría — ¡cuéntales a tus amigos y familia sobre {title}!
        </p>

        <Button
          type="button"
          disabled
          className="h-12 w-full rounded-full border-2 border-primary bg-card px-8 text-base font-semibold text-primary sm:w-auto"
        >
          Crear otra canción
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 rounded-[24px] border border-border bg-card shadow-[0_8px_30px_rgba(139,92,246,0.08)] p-8 text-center">
      <h1 className="font-heading text-heading font-bold text-foreground">
        Estamos creando algo único para {displayBabyName} ✨
      </h1>
      <div
        role="status"
        aria-label="Tu canción está en producción"
        className="size-10 animate-spin rounded-full border-4 border-muted border-t-primary"
      />
      <p className="text-body text-muted-foreground">
        Tu letra ya fue aprobada y nuestro sistema está produciendo una canción completamente
        personalizada para {displayBabyName}.
      </p>
      <p className="text-body text-muted-foreground">
        Este proceso puede tardar unos minutos porque cada canción se crea desde cero, cuidando cada
        detalle para que el resultado sea realmente especial.
      </p>
      <p className="text-body text-muted-foreground">
        En cuanto esté lista, recibirás un correo con el enlace para escucharla y descargarla.
      </p>
      <p className="text-caption text-muted-foreground">
        Esta página se cerrará automáticamente en unos segundos.
      </p>
    </div>
  );
}
