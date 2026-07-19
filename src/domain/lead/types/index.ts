import type { BabyAge } from "../value-objects/BabyAge";
import type { Email } from "../value-objects/Email";
import type { PhoneNumber } from "../value-objects/PhoneNumber";

/**
 * Coarse lifecycle for the Lead aggregate itself. This is intentionally
 * simpler than the persistence-layer `LeadStatus` enum in
 * `prisma/schema.prisma` (which also tracks lyrics/song sub-states) —
 * those finer states belong to the Lyrics/Song aggregates once they
 * exist. See docs/Architecture/Domain_Model.md for the mapping.
 */
export enum LeadStatus {
  REGISTERED = "REGISTERED",
  GENERATING = "GENERATING",
  COMPLETED = "COMPLETED",
  BLOCKED = "BLOCKED",
  FAILED = "FAILED",
}

/** Input to `Lead.create`. Raw primitives — value objects validate them. */
export interface CreateLeadInput {
  campaignId: string;
  parentName: string;
  babyName: string;
  babyAge?: number;
  city?: string;
  email: string;
  phone?: string;
}

/** Internal entity state. Not exported for external mutation — see `Lead`. */
export interface LeadProps {
  id: string;
  campaignId: string;
  parentName: string;
  babyName: string;
  babyAge: BabyAge | null;
  city: string | null;
  email: Email;
  phone: PhoneNumber | null;
  remainingAttempts: number;
  status: LeadStatus;
  /**
   * Opaque, cryptographically random, stable identifier for the "resume
   * journey" email link (see `ResolveResumeTokenUseCase`) — generated once
   * at registration and never rotated, so the same emailed link keeps
   * working for the lead's whole campaign lifetime. Never derived from or
   * exposing `id`/`email`.
   */
  resumeToken: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Plain, read-only view of a Lead for callers that need primitives (e.g. future mapping code). */
export interface LeadSnapshot {
  id: string;
  campaignId: string;
  parentName: string;
  babyName: string;
  babyAge: number | null;
  city: string | null;
  email: string;
  phone: string | null;
  remainingAttempts: number;
  status: LeadStatus;
  resumeToken: string;
  createdAt: Date;
  updatedAt: Date;
}
