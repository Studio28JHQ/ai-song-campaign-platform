import type { AdminUserSnapshot } from "@/domain/admin/types";

/** Response shape shared by every Administradores use case — never includes `passwordHash` (see `AdminUserSnapshot`). */
export type AdminUserView = AdminUserSnapshot;

/** Output of `ListAdminUsersUseCase`. */
export interface ListAdminUsersResponse {
  items: AdminUserView[];
}

/** Boundary-facing input for `CreateAdminUserUseCase`. `password` is plaintext here only — it is hashed before it ever reaches the domain layer. */
export interface CreateAdminUserRequest {
  email: string;
  password: string;
  name: string;
  role: string;
  /** The admin performing the creation — recorded in the audit trail. */
  actingAdminId: string;
}

/** Output of `CreateAdminUserUseCase`. */
export interface CreateAdminUserResponse {
  admin: AdminUserView;
}

/** Boundary-facing input for `UpdateAdminUserUseCase`. */
export interface UpdateAdminUserRequest {
  adminId: string;
  name: string;
  role: string;
  actingAdminId: string;
}

/** Output of `UpdateAdminUserUseCase`. */
export interface UpdateAdminUserResponse {
  admin: AdminUserView;
}

/** Boundary-facing input for `ChangeAdminPasswordUseCase`. `newPassword` is plaintext here only. */
export interface ChangeAdminPasswordRequest {
  adminId: string;
  newPassword: string;
  actingAdminId: string;
}

/** Output of `ChangeAdminPasswordUseCase`. */
export interface ChangeAdminPasswordResponse {
  admin: AdminUserView;
}

/** Boundary-facing input for `SetAdminActiveUseCase`. */
export interface SetAdminActiveRequest {
  adminId: string;
  active: boolean;
  actingAdminId: string;
}

/** Output of `SetAdminActiveUseCase`. */
export interface SetAdminActiveResponse {
  admin: AdminUserView;
}
