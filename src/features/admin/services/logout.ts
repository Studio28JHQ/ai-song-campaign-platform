/** Thin HTTP client for `POST /api/admin/logout`. Never fails in a way the caller needs to branch on — the cookie is always cleared. */
export async function logout(): Promise<void> {
  await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
}
