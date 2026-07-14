import type { DashboardSummary } from "../services/getDashboardSummary";

interface SummaryCardProps {
  label: string;
  value: number;
}

function SummaryCard({ label, value }: SummaryCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-background p-4">
      <span className="text-label text-muted-foreground">{label}</span>
      <span className="text-heading font-bold text-foreground">{value}</span>
    </div>
  );
}

interface DashboardSummaryCardsProps {
  summary: DashboardSummary;
}

/** The four read-only summary cards on the Admin Dashboard. No charts, no analytics — just counts (see docs/Product/User_Flow.md). */
export function DashboardSummaryCards({ summary }: DashboardSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <SummaryCard label="Total Leads" value={summary.totalLeads} />
      <SummaryCard label="Songs Completed" value={summary.songsCompleted} />
      <SummaryCard label="Songs Pending" value={summary.songsPending} />
      <SummaryCard label="Songs Failed" value={summary.songsFailed} />
    </div>
  );
}
