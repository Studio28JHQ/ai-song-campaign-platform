"use client";

import { useDashboardSummary } from "../hooks/useDashboardSummary";
import type { DashboardSummary } from "../services/getDashboardSummary";
import { DashboardSummaryCards } from "./DashboardSummaryCards";

const FUNNEL_STEPS: Array<{ label: string; value: (s: DashboardSummary) => number }> = [
  { label: "Registro", value: (s) => s.totalLeads },
  { label: "Letra generada", value: (s) => s.lyricsGenerated },
  { label: "Letra aprobada", value: (s) => s.lyricsApproved },
  { label: "Canción generada", value: (s) => s.songsCompleted },
  { label: "Correo enviado", value: (s) => s.emailsSent },
];

function formatMinutes(value: number | null): string {
  if (value === null) return "No disponible";
  if (value < 1) return "< 1 min";
  return `${value} min`;
}

/**
 * Sprint ADMIN-1 — Backoffice de Campaña. The campaign goal progress
 * bar — "3000 canciones" — driven by `summary.campaignGoal`
 * (`CAMPAIGN_MAX_SONGS`), never a hardcoded number.
 *
 * RC-final — Production Hardening: the numerator is
 * `campaignSongsGenerated` (`Campaign.songsGenerated`), the same
 * persisted counter the generation gate enforces against, falling back
 * to the live `songsCompleted` count only if no campaign row exists —
 * so this bar can never disagree with what the system is actually
 * enforcing.
 */
function CampaignGoalProgress({ summary }: { summary: DashboardSummary }) {
  const songsGenerated = summary.campaignSongsGenerated ?? summary.songsCompleted;
  const percentage =
    summary.campaignGoal > 0
      ? Math.min(100, Math.round((songsGenerated / summary.campaignGoal) * 100))
      : 0;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between">
        <span className="text-label text-muted-foreground">Meta de la campaña</span>
        <span className="text-sm font-semibold text-foreground">
          {songsGenerated} / {summary.campaignGoal} ({percentage}%)
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progreso hacia la meta de la campaña"
        className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function GenerationTimeStats({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-background p-4">
        <span className="text-label text-muted-foreground">Hoy</span>
        <span className="text-title font-semibold text-foreground">
          {formatMinutes(summary.averageGenerationMinutes.today)}
        </span>
      </div>
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-background p-4">
        <span className="text-label text-muted-foreground">Últimos 7 días</span>
        <span className="text-title font-semibold text-foreground">
          {formatMinutes(summary.averageGenerationMinutes.last7Days)}
        </span>
      </div>
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-background p-4">
        <span className="text-label text-muted-foreground">Últimos 30 días</span>
        <span className="text-title font-semibold text-foreground">
          {formatMinutes(summary.averageGenerationMinutes.last30Days)}
        </span>
      </div>
    </div>
  );
}

function ConversionFunnel({ summary }: { summary: DashboardSummary }) {
  return (
    <ol className="flex flex-col gap-2">
      {FUNNEL_STEPS.map((step, index) => (
        <li key={step.label} className="flex flex-col gap-1">
          <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-2.5">
            <span className="text-sm text-foreground">{step.label}</span>
            <span className="text-sm font-semibold text-foreground">{step.value(summary)}</span>
          </div>
          {index < FUNNEL_STEPS.length - 1 ? (
            <span aria-hidden className="ml-4 text-muted-foreground">
              ↓
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** The Admin Dashboard: KPI cards, campaign goal progress, generation-time stats, and the conversion funnel (see docs/Product/User_Flow.md). */
export function AdminDashboard() {
  const { summary, isLoading, errorMessage } = useDashboardSummary();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-heading font-bold text-foreground">Dashboard</h1>

      {isLoading ? (
        <p className="text-body text-muted-foreground">Cargando resumen...</p>
      ) : errorMessage ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : summary ? (
        <>
          <DashboardSummaryCards summary={summary} />
          <CampaignGoalProgress summary={summary} />

          <section className="flex flex-col gap-3">
            <h2 className="text-title font-semibold text-foreground">
              Tiempo promedio de generación
            </h2>
            <GenerationTimeStats summary={summary} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-title font-semibold text-foreground">Embudo de conversión</h2>
            <ConversionFunnel summary={summary} />
          </section>
        </>
      ) : null}
    </div>
  );
}
