"use client";

import { CheckCircle2, FileText, Music, Percent } from "lucide-react";
import { useDashboardSummary } from "../hooks/useDashboardSummary";
import type { DashboardSummary } from "../services/getDashboardSummary";
import { DailyBarChart } from "./DailyBarChart";
import { DashboardSummaryCards, SummaryCard } from "./DashboardSummaryCards";
import { RecentActivityPanel } from "./RecentActivityPanel";

/** Sprint FINAL-2 — Campaign Operations Dashboard. Exact funnel steps named in the brief. */
const FUNNEL_STEPS: Array<{ label: string; value: (s: DashboardSummary) => number }> = [
  { label: "Familias registradas", value: (s) => s.totalLeads },
  { label: "Letras generadas", value: (s) => s.lyricsGenerated },
  { label: "Letras aprobadas", value: (s) => s.lyricsApproved },
  { label: "Canciones completadas", value: (s) => s.songsCompleted },
  { label: "Correos enviados", value: (s) => s.emailsSent },
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

/**
 * Sprint FINAL-2 — Campaign Operations Dashboard. The six KPI cards the
 * brief names explicitly for "Estadísticas" — reuses the exact same
 * `SummaryCard` `DashboardSummaryCards` already renders, and every
 * value already exists on `DashboardSummary` (three window counts from
 * `PrismaAdminDashboardGate`, the two rates computed in
 * `GetDashboardSummaryUseCase`) — no new component, no new query shape.
 */
function StatisticsCards({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <SummaryCard label="Canciones hoy" value={summary.songsCompletedToday} icon={Music} />
      <SummaryCard
        label="Canciones últimos 7 días"
        value={summary.songsCompletedLast7Days}
        icon={Music}
      />
      <SummaryCard
        label="Canciones últimos 30 días"
        value={summary.songsCompletedLast30Days}
        icon={Music}
      />
      <SummaryCard
        label="Tiempo promedio de generación"
        value={formatMinutes(summary.averageGenerationMinutes.last30Days)}
        icon={FileText}
      />
      <SummaryCard
        label="Aprobación de letras"
        value={`${summary.lyricsApprovalRate}%`}
        icon={Percent}
      />
      <SummaryCard
        label="Éxito de canciones"
        value={`${summary.generationSuccessRate}%`}
        icon={CheckCircle2}
      />
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

/**
 * The Admin Dashboard: KPI cards, campaign goal progress, 30-day daily
 * trends, generation-time stats, additional statistics, the conversion
 * funnel, and recent activity (see docs/Product/User_Flow.md; Sprint
 * FINAL-2 — Campaign Operations Dashboard).
 */
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

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DailyBarChart
              title="Registros por día (últimos 30 días)"
              data={summary.registrationsByDay}
            />
            <DailyBarChart
              title="Canciones completadas por día (últimos 30 días)"
              data={summary.completedSongsByDay}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-title font-semibold text-foreground">Estadísticas</h2>
            <StatisticsCards summary={summary} />
          </section>

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

          <section className="flex flex-col gap-3">
            <h2 className="text-title font-semibold text-foreground">Actividad reciente</h2>
            <RecentActivityPanel />
          </section>
        </>
      ) : null}
    </div>
  );
}
