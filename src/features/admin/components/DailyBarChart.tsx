import type { DailyCount } from "../services/getDashboardSummary";

interface DailyBarChartProps {
  title: string;
  data: DailyCount[];
}

function formatDayLabel(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

/**
 * Sprint FINAL-2 — Campaign Operations Dashboard. A minimal, dependency-free
 * bar chart (plain divs, no charting library) for the two 30-day daily
 * trends the Dashboard needs — "Registros por día" and "Canciones
 * completadas por día". Reuses only existing design tokens
 * (`bg-primary`, `border-border`, `text-muted-foreground`) — no new
 * colors, same visual language as the existing progress bar.
 */
export function DailyBarChart({ title, data }: DailyBarChartProps) {
  const max = Math.max(1, ...data.map((day) => day.count));
  const total = data.reduce((sum, day) => sum + day.count, 0);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h3 className="text-label font-medium text-muted-foreground">{title}</h3>
        <span className="text-sm font-semibold text-foreground">Total: {total}</span>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin datos disponibles.</p>
      ) : (
        <>
          <div className="flex h-32 items-end gap-1" role="img" aria-label={title}>
            {data.map((day) => (
              <div
                key={day.date}
                className="flex min-w-[6px] flex-1 flex-col items-center"
                title={`${formatDayLabel(day.date)}: ${day.count}`}
              >
                <div
                  className="w-full rounded-t-sm bg-primary"
                  style={{ height: `${Math.max(2, Math.round((day.count / max) * 100))}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-label text-muted-foreground">
            <span>{formatDayLabel(data[0].date)}</span>
            <span>{formatDayLabel(data[data.length - 1].date)}</span>
          </div>
        </>
      )}
    </div>
  );
}
