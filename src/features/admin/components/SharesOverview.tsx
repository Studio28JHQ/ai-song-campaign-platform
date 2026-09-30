"use client";

import { MessageCircle, Share2, ThumbsUp, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardSummary } from "../hooks/useDashboardSummary";
import { buildSharesExportUrl } from "../services/shares";
import { DailyBarChart, type BarSegment } from "./DailyBarChart";
import { SummaryCard } from "./DashboardSummaryCards";
import { EmptyState } from "./EmptyState";
import { ErrorMessage } from "./ErrorMessage";

/**
 * Share Tracking — the "Compartidos" screen.
 *
 * Reads `GET /api/admin/dashboard` through the same hook the Dashboard
 * uses, rather than adding a second endpoint computing the same numbers:
 * the share aggregates already ride that route's single `Promise.all`,
 * and duplicating them would double the query load for one screen (the
 * connection pool here is capped at five per process).
 *
 * The one thing this screen must not do is overstate what it shows, so
 * it says plainly what a "compartido" is.
 */

/** The three platforms, coloured from tokens the admin already uses. */
const SEGMENTS: BarSegment[] = [
  { key: "whatsapp", label: "WhatsApp", className: "bg-primary" },
  { key: "facebook", label: "Facebook", className: "bg-accent" },
  { key: "x", label: "X", className: "bg-muted-foreground" },
];

export function SharesOverview() {
  const { summary, isLoading, errorMessage } = useDashboardSummary();

  if (errorMessage) return <ErrorMessage message={errorMessage} />;

  if (isLoading || !summary) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const { shares } = summary;
  const unavailable = (summary.unavailableSections ?? []).includes("shares");

  // The chart reads `count` for bar height and `breakdown` for the
  // stack, which is exactly the shape `DailyBarChart` gained.
  const chartData = shares.sharesByDay.map((day) => ({
    date: day.date,
    count: day.whatsapp + day.facebook + day.x,
    breakdown: { whatsapp: day.whatsapp, facebook: day.facebook, x: day.x },
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Un compartido es un clic registrado en un enlace del correo. No confirma que WhatsApp,
          Facebook o X hayan publicado nada, y los servicios de correo que revisan enlaces pueden
          generar registros adicionales.
        </p>
        <a
          href={buildSharesExportUrl()}
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className: "w-fit shrink-0",
          })}
        >
          Descargar CSV
        </a>
      </div>

      {unavailable ? (
        <ErrorMessage message="No se pudieron cargar los datos de compartidos." />
      ) : null}

      {/* Same grid the Dashboard's own card row uses. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="Total compartidos" value={shares.total} icon={Share2} />
        <SummaryCard label="WhatsApp" value={shares.whatsapp} icon={MessageCircle} />
        <SummaryCard label="Facebook" value={shares.facebook} icon={ThumbsUp} />
        <SummaryCard label="X" value={shares.x} icon={Share2} />
        <SummaryCard label="Familias que compartieron" value={shares.familiesShared} icon={Users} />
      </div>

      {shares.total === 0 ? (
        <EmptyState icon={Share2} title="Todavía no se ha registrado ningún compartido" />
      ) : (
        <DailyBarChart
          title="Compartidos por día"
          data={chartData}
          unitLabel="compartidos"
          segments={SEGMENTS}
        />
      )}
    </div>
  );
}
