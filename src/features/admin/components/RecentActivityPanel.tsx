"use client";

import Link from "next/link";
import { Activity, CheckCircle2, FileText, Mail, Music, Send, UserPlus } from "lucide-react";
import type { ComponentType } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useRecentActivity } from "../hooks/useRecentActivity";
import type { RecentActivityEventType } from "../services/listRecentActivity";
import { EmptyState } from "./EmptyState";
import { ErrorMessage } from "./ErrorMessage";

const EVENT_LABEL_ES: Record<RecentActivityEventType, string> = {
  lead_registered: "Nueva familia",
  lyrics_generated: "Letra generada",
  lyrics_approved: "Letra aprobada",
  song_completed: "Canción completada",
  email_sent: "Correo enviado",
  email_resent: "Reenvío de correo",
};

const EVENT_ICON: Record<RecentActivityEventType, ComponentType<{ className?: string }>> = {
  lead_registered: UserPlus,
  lyrics_generated: FileText,
  lyrics_approved: CheckCircle2,
  song_completed: Music,
  email_sent: Mail,
  email_resent: Send,
};

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString("es-MX");
}

/**
 * Sprint FINAL-2 — Campaign Operations Dashboard. "Actividad reciente":
 * the latest campaign-wide events, entirely reusing existing
 * Lead/Lyrics/Song timestamps and the existing `AuditLog` resend
 * entries (`ListRecentActivityUseCase`) — no new table. Same list/
 * timeline visual language as the Lead Detail screen's own execution
 * history.
 */
export function RecentActivityPanel() {
  const { items, isLoading, errorMessage } = useRecentActivity();

  if (isLoading) {
    return (
      <div
        className="flex flex-col gap-1"
        aria-busy="true"
        aria-label="Cargando actividad reciente"
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-12 rounded-xl" />
        ))}
      </div>
    );
  }

  if (errorMessage) {
    return <ErrorMessage message={errorMessage} />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="Aún no hay actividad registrada"
        description="Los eventos de la campaña aparecerán aquí a medida que ocurran."
      />
    );
  }

  return (
    <ol className="flex flex-col gap-1">
      {items.map((item, index) => {
        const Icon = EVENT_ICON[item.type];
        return (
          <li
            key={`${item.type}-${item.leadId}-${item.timestamp}-${index}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm transition-colors hover:bg-muted/50"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-sm text-foreground">
                {EVENT_LABEL_ES[item.type]} —{" "}
                <Link href={`/admin/leads/${item.leadId}`} className="text-primary underline">
                  {item.parentName} · {item.babyName}
                </Link>
              </span>
              <span className="shrink-0 text-label text-muted-foreground">
                {formatTimestamp(item.timestamp)}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
