import type { ReactNode } from "react";
import { AdminSidebar } from "@/features/admin/components/AdminSidebar";
import { getAdminSession } from "@/infrastructure/auth/getAdminSession";

/**
 * Sprint ADMIN-1 — Backoffice de Campaña. Wraps every `/admin/*` page
 * in the sidebar shell — except `/admin/login`, which has no session
 * yet. Rather than moving pages into a route group, this checks the
 * same session `middleware.ts` already gates every request on: no
 * session means we're on (or being redirected to) the login page, so
 * children render bare; a valid session means we're on a real
 * authenticated screen, so the sidebar wraps them. No new auth
 * mechanism — `getAdminSession` already existed for reading the
 * acting admin's identity.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getAdminSession();

  if (!session) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-dvh">
      <AdminSidebar />
      <div className="min-w-0 flex-1 overflow-x-auto">{children}</div>
    </div>
  );
}
