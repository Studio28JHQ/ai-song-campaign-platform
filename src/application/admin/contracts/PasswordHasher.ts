/**
 * What `LoginUseCase` needs to verify a password — nothing more. Keeps
 * the use case decoupled from the concrete hashing algorithm
 * (`@/infrastructure/auth`), the same pattern as `SunoGenerator`.
 */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
}
