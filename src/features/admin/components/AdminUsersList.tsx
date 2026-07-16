"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADMIN_ROLES } from "@/domain/admin/types";
import { useAdminUsersList } from "../hooks/useAdminUsersList";
import {
  type AdminUserRow,
  changeAdminPassword,
  createAdminUser,
  setAdminActive,
  updateAdminUser,
} from "../services/adminUsers";

const ROLE_LABEL_ES: Record<string, string> = {
  ADMIN: "Administrador",
  SUPER_ADMIN: "Super administrador",
};

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30";

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString("es-MX") : "—";
}

/**
 * Sprint ADMIN-1 — Backoffice de Campaña. The Administradores screen:
 * listar, crear, editar, cambiar contraseña, activar/desactivar. Roles
 * (`SUPER_ADMIN`/`ADMIN`) are persisted but do not yet imply any
 * permission difference (see `AdminUser.assertValidRole`).
 */
export function AdminUsersList() {
  const { items, isLoading, errorMessage, refetch } = useAdminUsersList();

  return (
    <div className="flex flex-col gap-6">
      <CreateAdminUserForm onCreated={refetch} />

      {isLoading ? <p className="text-body text-muted-foreground">Cargando...</p> : null}

      {errorMessage ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {!isLoading && !errorMessage ? (
        items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay administradores registrados.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Nombre
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Correo
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Rol
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Estado
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Último acceso
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((admin) => (
                  <AdminUserRowItem key={admin.id} admin={admin} onChanged={refetch} />
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </div>
  );
}

function CreateAdminUserForm({ onCreated }: { onCreated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>(ADMIN_ROLES[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit() {
    setNotification(null);
    setIsSubmitting(true);
    try {
      await createAdminUser({ email: email.trim(), password, name: name.trim(), role });
      setEmail("");
      setPassword("");
      setName("");
      setRole(ADMIN_ROLES[0]);
      setExpanded(false);
      setNotification({ ok: true, message: "Administrador creado correctamente." });
      onCreated();
    } catch (error) {
      setNotification({
        ok: false,
        message: error instanceof Error ? error.message : "Algo salió mal.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!expanded) {
    return (
      <div className="flex flex-col gap-2">
        <Button type="button" onClick={() => setExpanded(true)}>
          Nuevo administrador
        </Button>
        {notification ? (
          <p
            role={notification.ok ? "status" : "alert"}
            className={notification.ok ? "text-sm text-foreground" : "text-sm text-destructive"}
          >
            {notification.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h2 className="text-sm font-medium text-foreground">Nuevo administrador</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-admin-name">Nombre</Label>
          <Input
            id="new-admin-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isSubmitting}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-admin-email">Correo electrónico</Label>
          <Input
            id="new-admin-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isSubmitting}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-admin-password">Contraseña</Label>
          <Input
            id="new-admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isSubmitting}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-admin-role">Rol</Label>
          <select
            id="new-admin-role"
            className={selectClassName}
            value={role}
            onChange={(event) => setRole(event.target.value)}
            disabled={isSubmitting}
          >
            {ADMIN_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL_ES[r] ?? r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {notification && !notification.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {notification.message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={isSubmitting} onClick={handleSubmit}>
          {isSubmitting ? "Creando..." : "Crear administrador"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isSubmitting}
          onClick={() => setExpanded(false)}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function AdminUserRowItem({ admin, onChanged }: { admin: AdminUserRow; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(admin.name);
  const [role, setRole] = useState(admin.role);
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSaveProfile() {
    setIsSubmitting(true);
    setNotification(null);
    try {
      await updateAdminUser(admin.id, { name: name.trim(), role });
      setEditing(false);
      onChanged();
    } catch (error) {
      setNotification({
        ok: false,
        message: error instanceof Error ? error.message : "Algo salió mal.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleChangePassword() {
    setIsSubmitting(true);
    setNotification(null);
    try {
      await changeAdminPassword(admin.id, newPassword);
      setChangingPassword(false);
      setNewPassword("");
      setNotification({ ok: true, message: "Contraseña actualizada." });
    } catch (error) {
      setNotification({
        ok: false,
        message: error instanceof Error ? error.message : "Algo salió mal.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleActive() {
    setIsSubmitting(true);
    setNotification(null);
    try {
      await setAdminActive(admin.id, !admin.active);
      onChanged();
    } catch (error) {
      setNotification({
        ok: false,
        message: error instanceof Error ? error.message : "Algo salió mal.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-3 py-2">
        {editing ? (
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isSubmitting}
          />
        ) : (
          admin.name
        )}
      </td>
      <td className="px-3 py-2">{admin.email}</td>
      <td className="px-3 py-2">
        {editing ? (
          <select
            className={selectClassName}
            value={role}
            onChange={(event) => setRole(event.target.value)}
            disabled={isSubmitting}
          >
            {ADMIN_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL_ES[r] ?? r}
              </option>
            ))}
          </select>
        ) : (
          (ROLE_LABEL_ES[admin.role] ?? admin.role)
        )}
      </td>
      <td className="px-3 py-2">{admin.active ? "Activo" : "Inactivo"}</td>
      <td className="px-3 py-2">{formatDate(admin.lastLogin)}</td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-2">
          {editing ? (
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={isSubmitting} onClick={handleSaveProfile}>
                Guardar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isSubmitting}
                onClick={() => {
                  setEditing(false);
                  setName(admin.name);
                  setRole(admin.role);
                }}
              >
                Cancelar
              </Button>
            </div>
          ) : changingPassword ? (
            <div className="flex flex-col gap-2 rounded-md border border-border p-2">
              <Label htmlFor={`new-password-${admin.id}`}>Nueva contraseña</Label>
              <Input
                id={`new-password-${admin.id}`}
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={isSubmitting}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={isSubmitting || newPassword.length < 8}
                  onClick={handleChangePassword}
                >
                  {isSubmitting ? "Guardando..." : "Confirmar"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isSubmitting}
                  onClick={() => {
                    setChangingPassword(false);
                    setNewPassword("");
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                Editar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setChangingPassword(true)}
              >
                Cambiar contraseña
              </Button>
              <Button
                type="button"
                variant={admin.active ? "destructive" : "outline"}
                size="sm"
                disabled={isSubmitting}
                onClick={handleToggleActive}
              >
                {admin.active ? "Desactivar" : "Activar"}
              </Button>
            </div>
          )}

          {notification ? (
            <p
              role={notification.ok ? "status" : "alert"}
              className={notification.ok ? "text-sm text-foreground" : "text-sm text-destructive"}
            >
              {notification.message}
            </p>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
