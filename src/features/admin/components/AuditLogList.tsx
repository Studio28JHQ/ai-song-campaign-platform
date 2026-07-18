"use client";

import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuditLogList } from "../hooks/useAuditLogList";
import { EmptyState } from "./EmptyState";
import { ErrorMessage } from "./ErrorMessage";

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
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <Input
          type="search"
          placeholder="Buscar por acción o entidad..."
          aria-label="Buscar en la auditoría"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-sm"
        />
      </div>

      {errorMessage ? <ErrorMessage message={errorMessage} /> : null}

      {isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Cargando auditoría">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-11 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Aún no hay eventos registrados"
          description="Las acciones administrativas y de seguridad aparecerán aquí."
        />
      ) : (
        <div className="max-h-[32rem] overflow-auto rounded-xl border border-border shadow-sm">
          <table className="w-full min-w-max text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Fecha
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Administrador
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Acción
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Entidad
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-muted/50"
                >
                  <td className="px-4 py-3">{formatDate(entry.createdAt)}</td>
                  <td className="px-4 py-3">{entry.adminName}</td>
                  <td className="px-4 py-3">{ACTION_LABEL_ES[entry.action] ?? entry.action}</td>
                  <td className="px-4 py-3">
                    {ENTITY_LABEL_ES[entry.entity] ?? entry.entity}
                    {entry.entityId ? ` (${entry.entityId})` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Página {page} de {totalPages} ({total} en total)
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
