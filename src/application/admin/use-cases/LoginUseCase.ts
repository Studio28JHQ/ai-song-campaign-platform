import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AdminUserRepository } from "@/domain/admin/repositories/AdminUserRepository";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import { BusinessRuleError } from "@/shared/errors";
import type { PasswordHasher } from "../contracts/PasswordHasher";
import type { SessionTokenService } from "../contracts/SessionTokenService";
import type { LoginRequest } from "../dto/LoginRequest";
import type { LoginResponse } from "../dto/LoginResponse";

/**
 * Authenticates a campaign operator against the pre-provisioned
 * `AdminUser` table (there is no self-registration — see
 * PROJECT_MANIFEST.md). On success, issues a signed session token and
 * records both the login timestamp and an audit log entry.
 *
 * Whether the email doesn't exist, the password is wrong, or the account
 * is inactive, the caller only ever needs a message to show — this use
 * case throws a single `admin.invalid_credentials` error for the first
 * two (never revealing which one was wrong), and a distinct
 * `admin.account_inactive` for the third (an internal ops tool, so a more
 * specific message here is a legitimate operational aid, not a security
 * leak to the public).
 */
export class LoginUseCase {
  constructor(
    private readonly adminUserRepository: AdminUserRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly sessionTokenService: SessionTokenService,
  ) {}

  async execute(request: LoginRequest): Promise<LoginResponse> {
    const normalizedEmail = request.email.trim().toLowerCase();
    const admin = await this.adminUserRepository.findByEmail(normalizedEmail);

    if (!admin) {
      throw new BusinessRuleError("Invalid email or password.", {
        code: "admin.invalid_credentials",
      });
    }

    const passwordMatches = await this.passwordHasher.verify(request.password, admin.passwordHash);

    if (!passwordMatches) {
      throw new BusinessRuleError("Invalid email or password.", {
        code: "admin.invalid_credentials",
      });
    }

    admin.assertCanAuthenticate();
    admin.recordLogin();
    const updated = await this.adminUserRepository.update(admin);

    const issued = await this.sessionTokenService.issue(
      { adminId: updated.id, email: updated.email },
      { rememberMe: request.rememberMe },
    );

    await this.auditLogRepository.create(
      AuditLogEntry.create({
        adminId: updated.id,
        action: "login",
        entity: "AdminUser",
        entityId: updated.id,
      }),
    );

    return { admin: updated.toSnapshot(), token: issued.token, expiresAt: issued.expiresAt };
  }
}
