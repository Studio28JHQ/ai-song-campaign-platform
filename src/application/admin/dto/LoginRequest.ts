/** Boundary-facing input for `LoginUseCase`. */
export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}
