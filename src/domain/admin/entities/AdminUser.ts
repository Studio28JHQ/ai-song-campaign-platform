import { BusinessRuleError, ValidationError } from "@/shared/errors";
import { isValidEmailFormat } from "@/shared/validation/email";
import {
  ADMIN_ROLES,
  type AdminUserProps,
  type AdminUserSnapshot,
  type CreateAdminUserInput,
} from "../types";

/**
 * A campaign operator account. Sprint ADMIN-1 (Backoffice de Campaña)
 * added the create/edit/password/activation lifecycle on top of the
 * original read/login lifecycle — accounts are no longer provisioned
 * only by hand against the database.
 */
export class AdminUser {
  private constructor(private props: AdminUserProps) {}

  /** Creates a brand-new admin account. `passwordHash` must already be hashed (see `PasswordHasher`) — this layer never sees a plaintext password. */
  static create(input: CreateAdminUserInput): AdminUser {
    const email = AdminUser.requireNonEmpty(input.email, "email").toLowerCase();
    if (!isValidEmailFormat(email)) {
      throw new ValidationError("Enter a valid email address.", {
        code: "admin_user.invalid_email_format",
      });
    }

    const name = AdminUser.requireNonEmpty(input.name, "name");
    const passwordHash = AdminUser.requireNonEmpty(input.passwordHash, "passwordHash");
    const role = AdminUser.assertValidRole(input.role);

    const now = new Date();

    return new AdminUser({
      id: crypto.randomUUID(),
      email,
      passwordHash,
      name,
      role,
      active: true,
      lastLogin: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Rehydrates an AdminUser from already-persisted state. */
  static fromPersistence(props: AdminUserProps): AdminUser {
    return new AdminUser({ ...props });
  }

  private static requireNonEmpty(value: string, field: string): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new ValidationError(`${field} is required.`, {
        code: `admin_user.${field}_required`,
      });
    }
    return trimmed;
  }

  private static assertValidRole(role: string): string {
    if (!ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
      throw new ValidationError(`role must be one of: ${ADMIN_ROLES.join(", ")}.`, {
        code: "admin_user.invalid_role",
        context: { role },
      });
    }
    return role;
  }

  /** Throws if this account is not currently allowed to authenticate. */
  assertCanAuthenticate(): void {
    if (!this.props.active) {
      throw new BusinessRuleError("This admin account is inactive.", {
        code: "admin.account_inactive",
        context: { adminId: this.props.id },
      });
    }
  }

  /** Records a successful login. */
  recordLogin(): void {
    this.props.lastLogin = new Date();
    this.props.updatedAt = new Date();
  }

  /** Updates the editable profile fields — name and role. Email and password have their own dedicated operations. */
  updateProfile(input: { name: string; role: string }): void {
    this.props.name = AdminUser.requireNonEmpty(input.name, "name");
    this.props.role = AdminUser.assertValidRole(input.role);
    this.props.updatedAt = new Date();
  }

  /** Replaces the stored password hash — the caller must have already hashed the new password (see `PasswordHasher`). */
  changePasswordHash(newPasswordHash: string): void {
    this.props.passwordHash = AdminUser.requireNonEmpty(newPasswordHash, "passwordHash");
    this.props.updatedAt = new Date();
  }

  /** Soft-disables the account — it can no longer authenticate, but the row (and its audit trail) is preserved (see `AdminUserRepository` — no hard delete). */
  deactivate(): void {
    this.props.active = false;
    this.props.updatedAt = new Date();
  }

  activate(): void {
    this.props.active = true;
    this.props.updatedAt = new Date();
  }

  get id(): string {
    return this.props.id;
  }

  get email(): string {
    return this.props.email;
  }

  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get name(): string {
    return this.props.name;
  }

  get role(): string {
    return this.props.role;
  }

  get active(): boolean {
    return this.props.active;
  }

  get lastLogin(): Date | null {
    return this.props.lastLogin;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  toSnapshot(): AdminUserSnapshot {
    return {
      id: this.props.id,
      email: this.props.email,
      name: this.props.name,
      role: this.props.role,
      active: this.props.active,
      lastLogin: this.props.lastLogin,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
    };
  }
}
