"use client";

import {
  FileText,
  History,
  LayoutDashboard,
  Music,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LogoutButton } from "./LogoutButton";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/leads", label: "Familias", icon: Users },
  { href: "/admin/songs", label: "Canciones", icon: Music },
  { href: "/admin/lyrics", label: "Letras", icon: FileText },
  { href: "/admin/users", label: "Administradores", icon: ShieldCheck },
  { href: "/admin/audit", label: "Auditoría", icon: History },
  { href: "/admin/settings", label: "Configuración", icon: Settings },
] as const;

/**
 * Sprint ADMIN-1 — Backoffice de Campaña. The sidebar navigation shell
 * — one entry per module, each with an icon (brief: "Every menu entry
 * ... should include an icon"). Rendered only when `app/admin/layout.tsx`
 * confirms a valid session exists, so `/admin/login` never shows it.
 */
export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col justify-between border-r border-border bg-background px-4 py-6">
      <div className="flex flex-col gap-6">
        <span className="px-2 text-title font-bold text-foreground">Bassa</span>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <LogoutButton />
    </aside>
  );
}
