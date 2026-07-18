"use client";

import Link from "next/link";
import { CheckCircle2, FileText, Mail, Music, Send, UserPlus } from "lucide-react";
import type { ComponentType } from "react";
import { useRecentActivity } from "../hooks/useRecentActivity";
import type { RecentActivityEventType } from "../services/listRecentActivity";

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
    return <p className="text-body text-muted-foreground">Cargando...</p>;
  }

  if (errorMessage) {
    return (
      <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {errorMessage}
      </p>
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Aún no hay actividad registrada.</p>;
  }

  return (
    <ol className="flex flex-col gap-1">
      {items.map((item, index) => {
        const Icon = EVENT_ICON[item.type];
        return (
          <li
            key={`${item.type}-${item.leadId}-${item.timestamp}-${index}`}
            className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-2.5"
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
