import type { DailyCount } from "../services/getDashboardSummary";

/**
 * Share Tracking. One slice of a stacked bar: where its value lives on a
 * `DailyCount`, what to call it, and which existing token colours it.
 * Optional — without `segments` the chart behaves exactly as it always
 * has, which is what keeps the two existing charts untouched.
 */
export interface BarSegment {
  /** Key on `DailyCount.breakdown` holding this segment's value. */
  key: string;
  label: string;
  /** A background utility class from the existing palette — no new colours. */
  className: string;
}

interface DailyBarChartProps {
  title: string;
  data: DailyCount[];
  /** What one unit is, for the per-bar description: "registros", "canciones completadas". */
  unitLabel: string;
  /**
   * When given, each bar is split into these parts, stacked bottom-up,
   * and the chart renders a legend. The bar's total height still comes
   * from `count`, so the square-root scale and the zero handling are
   * identical to the single-series mode.
   */
  segments?: BarSegment[];
}

/**
 * Roughly how many date labels to print along the bottom. Thirty would be
 * illegible and two leaves the middle of the range unreadable; five or six
 * is enough to locate a bar in time.
 */
const TARGET_AXIS_LABELS = 6;

/**
 * The shortest bar a day with activity may be drawn as, in percent. Even
 * under the worst skew a day that happened has to be visible — and it has
 * to be unmistakably taller than a day that did not.
 */
const MIN_ACTIVE_BAR_PERCENT = 4;

/**
 * A day with zero. Drawn as a sliver in a muted tone rather than a short
 * `bg-primary` bar, so "nothing happened" reads as a different kind of
 * thing from "a little happened" instead of as a smaller amount of it.
 */
const ZERO_MARK_PERCENT = 1.5;

/**
 * The `date` on a `DailyCount` is already a campaign day (see
 * `PrismaAdminDashboardGate.bucketByDay`), so this renders it as written
 * instead of converting again — parsing it as UTC and formatting it as
 * UTC is what makes the key pass through untouched. Converting here would
 * shift every label by the offset that has already been applied.
 */
function formatDayLabel(dayKey: string): string {
  // `es-MX` rather than `es-EC`: both are Spanish, but `es-EC` renders a
  // short date as "1/9" and ignores the two-digit request, which makes a
  // row of labels ragged. This is the locale the chart already used.
  return new Date(`${dayKey}T00:00:00Z`).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Bar heights on a square-root scale.
 *
 * The campaign's real shape is two launch days at 250-280 registrations
 * against a fortnight of single digits and a stretch of zeros. On a linear
 * scale that put 28 of 30 bars on the floor and made the chart read as an
 * empty box with two towers — which is what prompted this work. A square
 * root compresses the peak without erasing the small days: against a
 * maximum of 250, one registration draws at 6% instead of 0.4%, twenty at
 * 28%, and the peak still reaches the top.
 *
 * Returns `null` for a day with no activity — the caller draws that
 * differently rather than as a very short bar.
 */
function barHeightPercent(count: number, max: number): number | null {
  if (count <= 0) return null;
  if (max <= 0) return null;

  const scaled = (Math.sqrt(count) / Math.sqrt(max)) * 100;
  return Math.max(MIN_ACTIVE_BAR_PERCENT, Math.round(scaled));
}

/** The indices whose date gets printed: the ends, plus an even spread between them. */
function axisLabelIndices(length: number): Set<number> {
  if (length === 0) return new Set();
  if (length <= TARGET_AXIS_LABELS) {
    return new Set(Array.from({ length }, (_, index) => index));
  }

  const step = Math.ceil((length - 1) / (TARGET_AXIS_LABELS - 1));
  const indices = new Set<number>();
  for (let index = 0; index < length; index += step) indices.add(index);
  indices.add(length - 1);
  return indices;
}

/**
 * Sprint FINAL-2 — Campaign Operations Dashboard, reworked in Sprint
 * FINAL-7 — Dashboard Charts. A dependency-free bar chart (plain divs) for
 * the two 30-day trends the Dashboard shows — "Registros por día" and
 * "Canciones completadas por día".
 *
 * Deliberately not a charting library: thirty bars and six date labels do
 * not justify ~100KB of JavaScript, and everything here is already
 * expressible with the existing design tokens (`bg-primary`,
 * `bg-muted-foreground`, `border-border`, `text-muted-foreground`). No new
 * colors.
 *
 * Every bar carries its own date and count as an `aria-label`, so the
 * series is readable by a screen reader one day at a time rather than only
 * as a picture with a summary.
 */
export function DailyBarChart({ title, data, unitLabel, segments }: DailyBarChartProps) {
  const max = Math.max(0, ...data.map((day) => day.count));
  const total = data.reduce((sum, day) => sum + day.count, 0);
  const labelIndices = axisLabelIndices(data.length);

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
          <div className="flex h-32 items-end gap-px sm:gap-1" role="list" aria-label={title}>
            {data.map((day) => {
              const height = barHeightPercent(day.count, max);
              const breakdown = segments
                ?.map((segment) => `${segment.label} ${day.breakdown?.[segment.key] ?? 0}`)
                .join(", ");
              const label = breakdown
                ? `${formatDayLabel(day.date)}: ${day.count} ${unitLabel} (${breakdown})`
                : `${formatDayLabel(day.date)}: ${day.count} ${unitLabel}`;

              return (
                <div
                  key={day.date}
                  role="listitem"
                  aria-label={label}
                  title={label}
                  className="flex h-full min-w-[3px] flex-1 flex-col justify-end"
                >
                  {height === null ? (
                    <div
                      className="w-full rounded-sm bg-muted-foreground/30"
                      style={{ height: `${ZERO_MARK_PERCENT}%` }}
                    />
                  ) : segments ? (
                    /*
                      Stacked: the bar keeps the height the square-root
                      scale gave it, and the segments divide that height
                      in proportion to their share of the day's count —
                      so a stacked bar is never taller or shorter than
                      the single-series bar for the same total.
                    */
                    <div
                      className="flex w-full flex-col-reverse overflow-hidden rounded-t-sm"
                      style={{ height: `${height}%` }}
                    >
                      {segments.map((segment) => {
                        const value = day.breakdown?.[segment.key] ?? 0;
                        if (value <= 0) return null;
                        return (
                          <div
                            key={segment.key}
                            className={segment.className}
                            style={{ height: `${(value / day.count) * 100}%` }}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      className="w-full rounded-t-sm bg-primary"
                      style={{ height: `${height}%` }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/*
            Only the selected dates are rendered, spread across the width,
            rather than one cell per bar. Thirty cells at 360px are ~12px
            wide and a "29/09" label is three times that, so per-bar cells
            would have the labels overlapping each other; spreading the six
            that are actually printed keeps them legible at every width, at
            the cost of them sitting approximately rather than exactly under
            their bar. They are `aria-hidden` because each bar already
            carries its own date in its label.
          */}
          <div className="flex justify-between text-label text-muted-foreground" aria-hidden="true">
            {data
              .filter((_, index) => labelIndices.has(index))
              .map((day) => (
                <span key={day.date} className="whitespace-nowrap">
                  {formatDayLabel(day.date)}
                </span>
              ))}
          </div>

          {segments ? (
            <div className="flex flex-wrap items-center justify-center gap-4">
              {segments.map((segment) => (
                <span
                  key={segment.key}
                  className="flex items-center gap-1.5 text-label text-muted-foreground"
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-sm ${segment.className}`}
                    aria-hidden="true"
                  />
                  {segment.label}
                </span>
              ))}
            </div>
          ) : null}

          {max === 0 ? <p className="text-sm text-muted-foreground">Sin actividad.</p> : null}
        </>
      )}
    </div>
  );
}
