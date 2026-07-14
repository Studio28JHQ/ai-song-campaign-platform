"use client";

import { useDashboardSummary } from "../hooks/useDashboardSummary";
import { DashboardSummaryCards } from "./DashboardSummaryCards";
import { LeadSearchTable } from "./LeadSearchTable";
import { LogoutButton } from "./LogoutButton";

/** The Admin Dashboard: summary cards, plus the searchable/sortable/paginated participants table (see docs/Product/User_Flow.md). */
export function AdminDashboard() {
  const { summary, isLoading, errorMessage } = useDashboardSummary();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-heading font-bold text-foreground">Dashboard</h1>
        <LogoutButton />
      </div>

      {isLoading ? (
        <p className="text-body text-muted-foreground">Loading summary...</p>
      ) : errorMessage ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : summary ? (
        <DashboardSummaryCards summary={summary} />
      ) : null}

      <LeadSearchTable />
    </div>
  );
}
