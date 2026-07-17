"use client";

import { Input } from "@/components/ui/input";
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
 *
 * Sprint FINAL-1 — Production Hardening: added free-text search
 * (action/entity/entityId) and pagination — a hard-capped, unfiltered
 * list of 200 stopped being usable once the campaign generates more
 * entries than that (every CSV export, retry, and admin action adds
 * one).
 */
export function AuditLogList() {
  const { items, total, page, pageSize, query, isLoading, errorMessage, setQuery, setPage } =
    useAuditLogList();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border p-3">
        <Input
          type="search"
          placeholder="Buscar por acción o entidad..."
          aria-label="Buscar en la auditoría"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-sm"
        />
      </div>

      {errorMessage ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

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
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                  Cargando...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                  Aún no hay eventos registrados.
                </td>
              </tr>
            ) : (
              items.map((entry) => (
                <tr key={entry.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{formatDate(entry.createdAt)}</td>
                  <td className="px-3 py-2">{entry.adminName}</td>
                  <td className="px-3 py-2">{ACTION_LABEL_ES[entry.action] ?? entry.action}</td>
                  <td className="px-3 py-2">
                    {ENTITY_LABEL_ES[entry.entity] ?? entry.entity}
                    {entry.entityId ? ` (${entry.entityId})` : ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Página {page} de {totalPages} ({total} en total)
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-md border border-border px-2 py-1 disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="rounded-md border border-border px-2 py-1 disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
