/**
 * Internal entity state for `AdminUser`. Not exported for external
 * mutation. There is no `CreateAdminUserInput` here — accounts are
 * provisioned directly against the database (see PROJECT_MANIFEST.md;
 * user management is out of scope for this module), so the only lifecycle
 * this domain models is authentication itself.
 */
export interface AdminUserProps {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: string;
  active: boolean;
  lastLogin: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Plain, read-only view of an AdminUser for callers that need
 * primitives. Deliberately omits `passwordHash` — this is the one place
 * that guarantees a password hash can never leak into an API response
 * (see docs/Architecture/System_Architecture.md — Security).
 */
export interface AdminUserSnapshot {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  lastLogin: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input to `AuditLogEntry.create`. `adminId: null` records a
 * system-recorded security/abuse event (Sprint 8.2) rather than an
 * admin-initiated action.
 */
export interface CreateAuditLogEntryInput {
  adminId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Internal entity state for `AuditLogEntry`. Not exported for external mutation. */
export interface AuditLogEntryProps {
  id: string;
  adminId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/** Plain, read-only view of an AuditLogEntry for callers that need primitives. */
export interface AuditLogEntrySnapshot {
  id: string;
  adminId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}
