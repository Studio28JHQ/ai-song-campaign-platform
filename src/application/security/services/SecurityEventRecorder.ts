import { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";

/**
 * The suspicious-behavior categories Sprint 8.2 asks to detect and
 * record. Kept as a closed set so every call site is self-documenting
 * and `AuditLog` queries can filter on a known `action` value.
 */
export type SecurityEventAction =
  "rate_limit_exceeded" | "invalid_turnstile_token" | "excessive_generation_attempts";

export interface RecordSecurityEventInput {
  action: SecurityEventAction;
  /** What the event is about, e.g. "Lead", "IpAddress". */
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Records suspicious public-facing behavior into the existing `AuditLog`
 * (Sprint 8.2 — Abuse Protection), reusing its `adminId: null` variant
 * (see `AuditLogEntry`) rather than introducing a parallel logging
 * table. Never throws into the caller's request path — a failure to log
 * must never block or fail the request itself.
 */
export class SecurityEventRecorder {
  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  async record(input: RecordSecurityEventInput): Promise<void> {
    try {
      await this.auditLogRepository.create(
        AuditLogEntry.create({
          adminId: null,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId ?? null,
          metadata: input.metadata ?? null,
        }),
      );
    } catch {
      // Logging is best-effort — a broken audit trail must never be the
      // reason a legitimate (or blocked) request fails.
    }
  }
}
