import { CheckCircle2, Clock, FileText, Mail, Music, Users, XCircle } from "lucide-react";
import type { ComponentType } from "react";
import type { DashboardSummary } from "../services/getDashboardSummary";

interface SummaryCardProps {
  label: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
}

/** Reused by `AdminDashboard`'s "Estadísticas" section (Sprint FINAL-2) — same card, no new component. */
export function SummaryCard({ label, value, icon: Icon }: SummaryCardProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-label text-muted-foreground">{label}</span>
        <span className="text-heading font-bold text-foreground">{value}</span>
      </div>
    </div>
  );
}

interface DashboardSummaryCardsProps {
  summary: DashboardSummary;
}

/**
 * Sprint ADMIN-1 — Backoffice de Campaña. The seven KPI cards the brief
 * names explicitly. "Canciones pendientes" is `songsQueued +
 * songsGenerating` — the two in-flight states — computed here, not in
 * the backend, since it's presentation grouping, not a new count.
 */
export function DashboardSummaryCards({ summary }: DashboardSummaryCardsProps) {
  const songsPending = summary.songsQueued + summary.songsGenerating;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <SummaryCard label="Familias registradas" value={summary.totalLeads} icon={Users} />
      <SummaryCard label="Letras generadas" value={summary.lyricsGenerated} icon={FileText} />
      <SummaryCard label="Letras aprobadas" value={summary.lyricsApproved} icon={CheckCircle2} />
      <SummaryCard label="Canciones completadas" value={summary.songsCompleted} icon={Music} />
      <SummaryCard label="Canciones pendientes" value={songsPending} icon={Clock} />
      <SummaryCard label="Canciones fallidas" value={summary.songsFailed} icon={XCircle} />
      <SummaryCard label="Correos enviados" value={summary.emailsSent} icon={Mail} />
    </div>
  );
}
