import type { DashboardSummary } from "../services/getDashboardSummary";

interface SummaryCardProps {
  label: string;
  value: string | number;
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

/** The nine read-only summary indicators on the Admin Dashboard. No charts, no BI dashboards — just counts and one derived percentage (see docs/Product/User_Flow.md). */
export function DashboardSummaryCards({ summary }: DashboardSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <SummaryCard label="Total Leads" value={summary.totalLeads} />
      <SummaryCard label="Lyrics Generated" value={summary.lyricsGenerated} />
      <SummaryCard label="Lyrics Approved" value={summary.lyricsApproved} />
      <SummaryCard label="Songs Requested" value={summary.songsRequested} />
      <SummaryCard label="Songs Queued" value={summary.songsQueued} />
      <SummaryCard label="Songs Generating" value={summary.songsGenerating} />
      <SummaryCard label="Songs Completed" value={summary.songsCompleted} />
      <SummaryCard label="Songs Failed" value={summary.songsFailed} />
      <SummaryCard label="Emails Sent" value={summary.emailsSent} />
      <SummaryCard label="Email Resent" value={summary.emailsResent} />
      <SummaryCard label="Generation Success Rate" value={`${summary.generationSuccessRate}%`} />
    </div>
  );
}
