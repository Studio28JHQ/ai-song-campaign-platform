"use client";

import { CheckCircle2, FileText, Music, Percent, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardSummary } from "../hooks/useDashboardSummary";
import type { DashboardSection, DashboardSummary } from "../services/getDashboardSummary";
import { DailyBarChart } from "./DailyBarChart";
import { DashboardSummaryCards, SummaryCard } from "./DashboardSummaryCards";
import { ErrorMessage } from "./ErrorMessage";
import { RecentActivityPanel } from "./RecentActivityPanel";
import { SectionHeader } from "./SectionHeader";

/** Sprint FINAL-2 — Campaign Operations Dashboard. Exact funnel steps named in the brief. */
const FUNNEL_STEPS: Array<{ label: string; value: (s: DashboardSummary) => number }> = [
  { label: "Familias registradas", value: (s) => s.totalLeads },
  { label: "Letras generadas", value: (s) => s.lyricsGenerated },
  { label: "Letras aprobadas", value: (s) => s.lyricsApproved },
  { label: "Canciones completadas", value: (s) => s.songsCompleted },
  { label: "Correos enviados", value: (s) => s.emailsSent },
];

/** Sprint FINAL-3 — Dashboard Stabilization. Spanish copy for a widget whose backing query failed — the rest of the Dashboard keeps working. */
const SECTION_ERROR_ES = "No fue posible cargar esta sección. Inténtalo nuevamente.";

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
  const failed = (summary.unavailableSections ?? []).includes("campaign");

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm">
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
      {failed ? <ErrorMessage size="sm" message={SECTION_ERROR_ES} /> : null}
    </div>
  );
}

function GenerationTimeStats({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 shadow-sm">
        <span className="text-label text-muted-foreground">Hoy</span>
        <span className="text-title font-semibold text-foreground">
          {formatMinutes(summary.averageGenerationMinutes.today)}
        </span>
      </div>
      <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 shadow-sm">
        <span className="text-label text-muted-foreground">Últimos 7 días</span>
        <span className="text-title font-semibold text-foreground">
          {formatMinutes(summary.averageGenerationMinutes.last7Days)}
        </span>
      </div>
      <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 shadow-sm">
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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm">
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

/** Sprint FINAL-3 — Dashboard Stabilization. Skeleton shell matching the loaded layout's shape — avoids layout shift once real data arrives. */
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Cargando el panel">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-16 rounded-xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * The Admin Dashboard: KPI cards, campaign goal progress, 30-day daily
 * trends, generation-time stats, additional statistics, the conversion
 * funnel, and recent activity (see docs/Product/User_Flow.md; Sprint
 * FINAL-2 — Campaign Operations Dashboard).
 *
 * Sprint FINAL-3 — Dashboard Stabilization: each widget now reads
 * `summary.unavailableSections` and shows its own small, localized
 * error instead of the whole page failing — see
 * `PrismaAdminDashboardGate` for why a single failing query can no
 * longer take the entire Dashboard down.
 */
export function AdminDashboard() {
  const { summary, isLoading, errorMessage } = useDashboardSummary();

  const isUnavailable = (section: DashboardSection): boolean =>
    (summary?.unavailableSections ?? []).includes(section);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-heading font-bold text-foreground">Dashboard</h1>

      {isLoading ? (
        <DashboardSkeleton />
      ) : errorMessage ? (
        <ErrorMessage message={errorMessage} />
      ) : summary ? (
        <>
          <section className="flex flex-col gap-3">
            {isUnavailable("core") ? <ErrorMessage size="sm" message={SECTION_ERROR_ES} /> : null}
            <DashboardSummaryCards summary={summary} />
          </section>

          <CampaignGoalProgress summary={summary} />

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {isUnavailable("dailyTrends") ? (
              <div className="lg:col-span-2">
                <ErrorMessage size="sm" message={SECTION_ERROR_ES} />
              </div>
            ) : null}
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
            <SectionHeader icon={TrendingUp} title="Estadísticas" />
            {isUnavailable("windowCounts") || isUnavailable("generationTime") ? (
              <ErrorMessage size="sm" message={SECTION_ERROR_ES} />
            ) : null}
            <StatisticsCards summary={summary} />
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader icon={FileText} title="Tiempo promedio de generación" />
            {isUnavailable("generationTime") ? (
              <ErrorMessage size="sm" message={SECTION_ERROR_ES} />
            ) : null}
            <GenerationTimeStats summary={summary} />
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader icon={CheckCircle2} title="Embudo de conversión" />
            {isUnavailable("core") ? <ErrorMessage size="sm" message={SECTION_ERROR_ES} /> : null}
            <ConversionFunnel summary={summary} />
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader icon={Music} title="Actividad reciente" />
            <RecentActivityPanel />
          </section>
        </>
      ) : null}
    </div>
  );
}
