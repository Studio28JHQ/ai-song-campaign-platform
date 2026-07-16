"use client";

import { useAuditLogList } from "../hooks/useAuditLogList";

const ACTION_LABEL_ES: Record<string, string> = {
  login: "Inicio de sesión",
  view_lead: "Ficha consultada",
  retry_song: "Reintento de canción",
  resend_email: "Reenvío de correo",
  create_admin_user: "Administrador creado",
  update_admin_user: "Administrador editado",
  change_admin_password: "Contraseña restablecida",
  activate_admin_user: "Administrador activado",
  deactivate_admin_user: "Administrador desactivado",
  rate_limit_exceeded: "Límite de solicitudes excedido",
  invalid_turnstile_token: "Token de verificación inválido",
  excessive_generation_attempts: "Intentos de generación excesivos",
  invalid_login_credentials: "Credenciales de acceso inválidas",
};

const ENTITY_LABEL_ES: Record<string, string> = {
  Lead: "Familia",
  Song: "Canción",
  Lyrics: "Letra",
  AdminUser: "Administrador",
  IpAddress: "Dirección IP",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("es-MX");
}

/**
 * Sprint ADMIN-1 — Backoffice de Campaña. The "Auditoría" screen —
 * a read-only view over the existing `AuditLog` table, covering both
 * admin-initiated actions and system-recorded security events (see
 * `SecurityEventRecorder`, Sprint 8.2). No new logging is introduced
 * here — only a Spanish-labeled presentation of what already exists.
 */
export function AuditLogList() {
  const { items, isLoading, errorMessage } = useAuditLogList();

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
    return <p className="text-sm text-muted-foreground">Aún no hay eventos registrados.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="border-b border-border bg-muted/30">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Fecha
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Administrador
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Acción
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Entidad
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr key={entry.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2">{formatDate(entry.createdAt)}</td>
              <td className="px-3 py-2">{entry.adminName}</td>
              <td className="px-3 py-2">{ACTION_LABEL_ES[entry.action] ?? entry.action}</td>
              <td className="px-3 py-2">
                {ENTITY_LABEL_ES[entry.entity] ?? entry.entity}
                {entry.entityId ? ` (${entry.entityId})` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
