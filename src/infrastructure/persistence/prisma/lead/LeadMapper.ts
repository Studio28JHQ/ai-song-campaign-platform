import type { Lead as PrismaLeadRecord } from "@/generated/prisma/client";
import { LeadStatus as PrismaLeadStatus, type Prisma } from "@/generated/prisma/client";
import { Lead } from "@/domain/lead/entities/Lead";
import { LeadStatus as DomainLeadStatus, type LeadProps } from "@/domain/lead/types";
import { BabyAge } from "@/domain/lead/value-objects/BabyAge";
import { Email } from "@/domain/lead/value-objects/Email";
import { PhoneNumber } from "@/domain/lead/value-objects/PhoneNumber";
import { InfrastructureError } from "@/shared/errors";

/**
 * Prisma's `LeadStatus` (see prisma/schema.prisma) is more granular than
 * the domain's — it also tracks lyrics/song sub-states that don't have
 * their own aggregates yet. Every "in progress" persistence status
 * collapses to the domain's single GENERATING status on read; COMPLETED
 * and BLOCKED map 1:1. See docs/Architecture/Domain_Model.md.
 */
const PERSISTENCE_TO_DOMAIN_STATUS: Record<PrismaLeadStatus, DomainLeadStatus> = {
  REGISTERED: DomainLeadStatus.REGISTERED,
  MODERATION_REJECTED: DomainLeadStatus.GENERATING,
  LYRICS_GENERATED: DomainLeadStatus.GENERATING,
  LYRICS_APPROVED: DomainLeadStatus.GENERATING,
  SONG_GENERATING: DomainLeadStatus.GENERATING,
  SONG_READY: DomainLeadStatus.GENERATING,
  COMPLETED: DomainLeadStatus.COMPLETED,
  ATTEMPTS_EXHAUSTED: DomainLeadStatus.BLOCKED,
};

/**
 * The reverse mapping is lossy in one place: the domain's FAILED status has
 * no persistence-layer equivalent yet. Rather than silently mis-storing it
 * as ATTEMPTS_EXHAUSTED (a different business meaning), writes for FAILED
 * are rejected — see `toPersistenceStatus`.
 */
const DOMAIN_TO_PERSISTENCE_STATUS: Record<DomainLeadStatus, PrismaLeadStatus | null> = {
  [DomainLeadStatus.REGISTERED]: PrismaLeadStatus.REGISTERED,
  [DomainLeadStatus.GENERATING]: PrismaLeadStatus.LYRICS_GENERATED,
  [DomainLeadStatus.COMPLETED]: PrismaLeadStatus.COMPLETED,
  [DomainLeadStatus.BLOCKED]: PrismaLeadStatus.ATTEMPTS_EXHAUSTED,
  [DomainLeadStatus.FAILED]: null,
};

/** Translates between the Prisma `Lead` model and the `Lead` domain entity. Infrastructure-only — never imported outside this layer. */
export class LeadMapper {
  static toDomain(record: PrismaLeadRecord): Lead {
    const props: LeadProps = {
      id: record.id,
      campaignId: record.campaignId,
      parentName: record.parentName,
      babyName: record.babyName,
      babyAge: record.babyAge !== null ? BabyAge.create(record.babyAge) : null,
      city: record.city,
      email: Email.create(record.email),
      phone: record.phone !== null ? PhoneNumber.create(record.phone) : null,
      remainingAttempts: record.remainingAttempts,
      status: PERSISTENCE_TO_DOMAIN_STATUS[record.status],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };

    return Lead.fromPersistence(props);
  }

  static toCreateInput(lead: Lead): Prisma.LeadUncheckedCreateInput {
    return {
      id: lead.id,
      campaignId: lead.campaignId,
      parentName: lead.parentName,
      babyName: lead.babyName,
      babyAge: lead.babyAge?.value ?? null,
      city: lead.city,
      email: lead.email.toString(),
      phone: lead.phone?.toString() ?? null,
      remainingAttempts: lead.remainingAttempts,
      status: LeadMapper.toPersistenceStatus(lead.status),
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    };
  }

  static toUpdateInput(lead: Lead): Prisma.LeadUncheckedUpdateInput {
    return {
      parentName: lead.parentName,
      babyName: lead.babyName,
      babyAge: lead.babyAge?.value ?? null,
      city: lead.city,
      phone: lead.phone?.toString() ?? null,
      remainingAttempts: lead.remainingAttempts,
      status: LeadMapper.toPersistenceStatus(lead.status),
      updatedAt: lead.updatedAt,
    };
  }

  private static toPersistenceStatus(status: DomainLeadStatus): PrismaLeadStatus {
    const mapped = DOMAIN_TO_PERSISTENCE_STATUS[status];

    if (mapped === null) {
      throw new InfrastructureError(
        `Cannot persist LeadStatus.${status}: no equivalent value exists in the database schema yet.`,
        { code: "lead.unsupported_persistence_status", context: { status } },
      );
    }

    return mapped;
  }
}
