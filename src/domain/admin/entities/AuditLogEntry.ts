import { ValidationError } from "@/shared/errors";
import type { AuditLogEntryProps, AuditLogEntrySnapshot, CreateAuditLogEntryInput } from "../types";

/**
 * An immutable record of either an administrative action (e.g. a login,
 * or viewing a lead's detail page — `adminId` set) or, as of Sprint 8.2,
 * a system-recorded security/abuse event (`adminId: null`) such as a
 * rate limit being exceeded or an invalid Turnstile token. Shown as
 * read-only "audit history" on operational views (see
 * docs/Product/User_Flow.md). Entries are never edited or deleted once
 * created.
 */
export class AuditLogEntry {
  private constructor(private props: AuditLogEntryProps) {}

  static create(input: CreateAuditLogEntryInput): AuditLogEntry {
    const adminId =
      input.adminId === null ? null : AuditLogEntry.requireNonEmpty(input.adminId, "adminId");
    const action = AuditLogEntry.requireNonEmpty(input.action, "action");
    const entity = AuditLogEntry.requireNonEmpty(input.entity, "entity");

    return new AuditLogEntry({
      id: crypto.randomUUID(),
      adminId,
      action,
      entity,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? null,
      createdAt: new Date(),
    });
  }

  /** Rehydrates an AuditLogEntry from already-persisted state. */
  static fromPersistence(props: AuditLogEntryProps): AuditLogEntry {
    return new AuditLogEntry({ ...props });
  }

  private static requireNonEmpty(value: string, field: string): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new ValidationError(`${field} is required.`, {
        code: `audit_log.${field}_required`,
      });
    }
    return trimmed;
  }

  get id(): string {
    return this.props.id;
  }

  get adminId(): string | null {
    return this.props.adminId;
  }

  get action(): string {
    return this.props.action;
  }

  get entity(): string {
    return this.props.entity;
  }

  get entityId(): string | null {
    return this.props.entityId;
  }

  get metadata(): Record<string, unknown> | null {
    return this.props.metadata;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  toSnapshot(): AuditLogEntrySnapshot {
    return {
      id: this.props.id,
      adminId: this.props.adminId,
      action: this.props.action,
      entity: this.props.entity,
      entityId: this.props.entityId,
      metadata: this.props.metadata,
      createdAt: this.props.createdAt,
    };
  }
}
