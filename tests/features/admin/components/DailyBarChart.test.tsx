import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DailyBarChart } from "@/features/admin/components/DailyBarChart";
import type { DailyCount } from "@/features/admin/services/getDashboardSummary";

/**
 * Sprint FINAL-7 — Dashboard Charts.
 *
 * The chart was already rendering before this work; what it was not doing
 * was saying anything. The campaign's real shape is two launch days at
 * 250-280 registrations against a fortnight of single digits and a run of
 * zeros, and on a linear scale with a 2% floor that put 28 of 30 bars on
 * the floor — where a day with nothing looked exactly like a day with one.
 * These tests hold the two fixes in place: a square-root scale that keeps
 * the small days visible, and a zero that reads as a different kind of
 * thing rather than a smaller amount.
 */

function series(counts: number[], startDay = 1): DailyCount[] {
  return counts.map((count, index) => ({
    date: `2026-09-${String(startDay + index).padStart(2, "0")}`,
    count,
  }));
}

/** The inline height a bar was given, as a number of percent. */
function barHeights(): number[] {
  return screen.getAllByRole("listitem").map((item) => {
    const bar = item.firstElementChild as HTMLElement;
    return Number.parseFloat(bar.style.height);
  });
}

/** Whether each bar is a real bar (`bg-primary`) or the zero mark. */
function barKinds(): Array<"bar" | "zero"> {
  return screen.getAllByRole("listitem").map((item) => {
    const bar = item.firstElementChild as HTMLElement;
    return bar.className.includes("bg-primary") ? "bar" : "zero";
  });
}

describe("DailyBarChart", () => {
  it("[1] draws every day with activity, and marks the days without it differently", () => {
    render(
      <DailyBarChart title="Registros" data={series([2, 5, 10, 0, 1])} unitLabel="registros" />,
    );

    expect(barKinds()).toEqual(["bar", "bar", "bar", "zero", "bar"]);

    const heights = barHeights();
    // Ordered by value, and the zero is below every bar that exists.
    expect(heights[2]).toBeGreaterThan(heights[1]);
    expect(heights[1]).toBeGreaterThan(heights[0]);
    expect(heights[0]).toBeGreaterThan(heights[4]);
    expect(heights[4]).toBeGreaterThan(heights[3]);
    // The busiest day fills the plot.
    expect(heights[2]).toBe(100);
  });

  it("[1] a day with zero is not drawn as the same height as a day with one", () => {
    render(<DailyBarChart title="Registros" data={series([0, 1])} unitLabel="registros" />);

    const [zero, one] = barHeights();
    expect(zero).toBeLessThan(one);
    expect(barKinds()).toEqual(["zero", "bar"]);
  });

  it("[2] keeps the quiet days visible when one day is two orders of magnitude bigger", () => {
    // The production case: 250 against 1. Linearly, 1 would draw at 0.4%.
    render(
      <DailyBarChart
        title="Registros"
        data={series([0, 1, 2, 5, 10, 20, 250])}
        unitLabel="registros"
      />,
    );

    const [zero, one, two, five, ten, twenty, peak] = barHeights();

    expect(peak).toBe(100);
    // Every day that happened is comfortably above the zero mark, and
    // above the threshold where a bar stops being perceptible.
    for (const height of [one, two, five, ten, twenty]) {
      expect(height).toBeGreaterThanOrEqual(4);
      expect(height).toBeGreaterThan(zero);
    }
    // Still monotonic, so the chart does not lie about which day was busier.
    expect(one).toBeLessThan(two);
    expect(two).toBeLessThan(five);
    expect(five).toBeLessThan(ten);
    expect(ten).toBeLessThan(twenty);
    expect(twenty).toBeLessThan(peak);
    // And square root, not linear: 1 against a peak of 250 draws around
    // 6%, where a linear scale would have given it 0.4%.
    expect(one).toBeGreaterThan(3);
    expect(one).toBeLessThan(12);
  });

  it("[3] handles an all-zero series without dividing by zero, and says there was no activity", () => {
    render(<DailyBarChart title="Registros" data={series([0, 0, 0, 0])} unitLabel="registros" />);

    expect(barKinds()).toEqual(["zero", "zero", "zero", "zero"]);
    for (const height of barHeights()) {
      expect(Number.isFinite(height)).toBe(true);
      expect(height).toBeGreaterThan(0);
    }
    expect(screen.getByText("Sin actividad.")).toBeInTheDocument();
    expect(screen.getByText("Total: 0")).toBeInTheDocument();
  });

  it("keeps an empty series as an explicit empty state rather than an empty plot", () => {
    render(<DailyBarChart title="Registros" data={[]} unitLabel="registros" />);

    expect(screen.getByText("Sin datos disponibles.")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("describes each day for a screen reader, with its date and its count", () => {
    render(<DailyBarChart title="Registros" data={series([0, 282])} unitLabel="registros" />);

    expect(screen.getByLabelText("01/09: 0 registros")).toBeInTheDocument();
    expect(screen.getByLabelText("02/09: 282 registros")).toBeInTheDocument();
  });

  it("names the unit it was given, so both charts read correctly", () => {
    render(
      <DailyBarChart title="Canciones" data={series([7])} unitLabel="canciones completadas" />,
    );

    expect(screen.getByLabelText("01/09: 7 canciones completadas")).toBeInTheDocument();
  });

  it("prints five or six dates across a 30-day range, not thirty and not two", () => {
    const thirtyDays: DailyCount[] = Array.from({ length: 30 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 8, 1 + index)).toISOString().slice(0, 10),
      count: index,
    }));

    render(<DailyBarChart title="Registros" data={thirtyDays} unitLabel="registros" />);

    // The axis row is the one hidden from screen readers; count what it prints.
    const printed = document.querySelectorAll('[aria-hidden="true"] > span');
    expect(printed.length).toBeGreaterThanOrEqual(5);
    expect(printed.length).toBeLessThanOrEqual(7);
    // The ends are always among them.
    expect(printed[0].textContent).toBe("01/09");
    expect(printed[printed.length - 1].textContent).toBe("30/09");
  });

  it("renders the day key it was given, without shifting it into another timezone", () => {
    // The key already is a campaign day (see
    // `PrismaAdminDashboardGate.bucketByDay`). Converting again here would
    // move every label by an offset that has already been applied.
    render(
      <DailyBarChart
        title="Registros"
        data={[{ date: "2026-09-28", count: 3 }]}
        unitLabel="registros"
      />,
    );

    expect(screen.getByLabelText("28/09: 3 registros")).toBeInTheDocument();
    expect(screen.queryByLabelText(/27\/09/)).not.toBeInTheDocument();
  });
});
