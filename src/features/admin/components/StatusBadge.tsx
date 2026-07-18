/**
 * Sprint FINAL-3 — Dashboard Stabilization. Standardized status-badge
 * variants, reusing only existing, previously-defined tokens
 * (`--color-success`/`--color-primary`/`--color-warning`/
 * `--color-destructive`/`--color-muted`) — no new colors.
 */
export type StatusVariant = "success" | "primary" | "warning" | "destructive" | "muted";

const VARIANT_CLASS: Record<StatusVariant, string> = {
  success: "bg-success/15 text-success",
  primary: "bg-primary/15 text-primary",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/15 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

export function StatusBadge({ label, variant }: { label: string; variant: StatusVariant }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${VARIANT_CLASS[variant]}`}
    >
      {label}
    </span>
  );
}

/**
 * The public song-status vocabulary (QUEUED/GENERATING/COMPLETED/FAILED,
 * plus "NONE" for a lead with no song yet), mapped to the suggested
 * variant scheme: Completada → success, Generando → primary, En cola →
 * warning, Fallida → destructive, sin canción → muted (pending).
 */
const SONG_STATUS_LABEL_ES: Record<string, string> = {
  QUEUED: "En cola",
  GENERATING: "Generando",
  COMPLETED: "Completada",
  FAILED: "Fallida",
  NONE: "Sin canción",
};

const SONG_STATUS_VARIANT: Record<string, StatusVariant> = {
  QUEUED: "warning",
  GENERATING: "primary",
  COMPLETED: "success",
  FAILED: "destructive",
  NONE: "muted",
};

export function SongStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge
      label={SONG_STATUS_LABEL_ES[status] ?? status}
      variant={SONG_STATUS_VARIANT[status] ?? "muted"}
    />
  );
}

/** The Lead lifecycle vocabulary (REGISTERED/GENERATING/COMPLETED/BLOCKED/FAILED), same variant scheme. */
const LEAD_STATUS_LABEL_ES: Record<string, string> = {
  REGISTERED: "Registrada",
  GENERATING: "Generando",
  COMPLETED: "Completada",
  BLOCKED: "Bloqueada",
  FAILED: "Fallida",
};

const LEAD_STATUS_VARIANT: Record<string, StatusVariant> = {
  REGISTERED: "muted",
  GENERATING: "primary",
  COMPLETED: "success",
  BLOCKED: "warning",
  FAILED: "destructive",
};

export function LeadStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge
      label={LEAD_STATUS_LABEL_ES[status] ?? status}
      variant={LEAD_STATUS_VARIANT[status] ?? "muted"}
    />
  );
}
