import { BusinessRuleError } from "@/shared/errors";
import type { AdminUserProps, AdminUserSnapshot } from "../types";

/**
 * A campaign operator account. There is no registration/creation flow in
 * this module — accounts are provisioned directly against the database
 * (see PROJECT_MANIFEST.md; user management and role management are out
 * of scope). This entity only models the read/login lifecycle: whether
 * the account is currently allowed to authenticate, and recording a
 * successful login.
 */
export class AdminUser {
  private constructor(private props: AdminUserProps) {}

  /** Rehydrates an AdminUser from already-persisted state. */
  static fromPersistence(props: AdminUserProps): AdminUser {
    return new AdminUser({ ...props });
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
