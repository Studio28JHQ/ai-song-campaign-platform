import type { AdminUserSnapshot } from "@/domain/admin/types";

/** Output of `LoginUseCase`. `token` is the value the route stores in the HTTP-only session cookie — it is never sent to the client as JSON. */
export interface LoginResponse {
  admin: AdminUserSnapshot;
  token: string;
  expiresAt: Date;
}
