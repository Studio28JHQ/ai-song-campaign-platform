export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListAdminUsersResult {
  items: AdminUserRow[];
}

export interface CreateAdminUserInput {
  email: string;
  password: string;
  name: string;
  role: string;
}

export interface UpdateAdminUserInput {
  name: string;
  role: string;
}

export class AdminUsersError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminUsersError";
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = (body ?? {}) as { message?: unknown };
    const message = typeof record.message === "string" ? record.message : "Something went wrong.";
    throw new AdminUsersError(message);
  }

  return body as T;
}

async function safeFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new AdminUsersError(
      "We couldn't reach the server. Please check your connection and try again.",
    );
  }
}

/** Thin HTTP client for the Administradores screen (Sprint ADMIN-1 — Backoffice de Campaña). No business rule is evaluated here. */
export async function listAdminUsers(): Promise<ListAdminUsersResult> {
  const response = await safeFetch("/api/admin/users");
  return parseResponse<ListAdminUsersResult>(response);
}

export async function createAdminUser(
  input: CreateAdminUserInput,
): Promise<{ admin: AdminUserRow }> {
  const response = await safeFetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseResponse<{ admin: AdminUserRow }>(response);
}

export async function updateAdminUser(
  adminId: string,
  input: UpdateAdminUserInput,
): Promise<{ admin: AdminUserRow }> {
  const response = await safeFetch(`/api/admin/users/${adminId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseResponse<{ admin: AdminUserRow }>(response);
}

export async function changeAdminPassword(
  adminId: string,
  newPassword: string,
): Promise<{ admin: AdminUserRow }> {
  const response = await safeFetch(`/api/admin/users/${adminId}/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword }),
  });
  return parseResponse<{ admin: AdminUserRow }>(response);
}

export async function setAdminActive(
  adminId: string,
  active: boolean,
): Promise<{ admin: AdminUserRow }> {
  const response = await safeFetch(`/api/admin/users/${adminId}/active`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
  return parseResponse<{ admin: AdminUserRow }>(response);
}
