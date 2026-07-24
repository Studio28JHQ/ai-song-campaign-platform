import type { Consent as PrismaConsentRecord, Prisma } from "@/generated/prisma/client";
import { Consent } from "@/domain/consent/entities/Consent";
import type { ConsentProps } from "@/domain/consent/types";

/** Translates between the Prisma `Consent` model and the `Consent` domain entity. Infrastructure-only — never imported outside this layer. */
export class ConsentMapper {
  static toDomain(record: PrismaConsentRecord): Consent {
    const props: ConsentProps = {
      id: record.id,
      sessionId: record.sessionId,
      leadId: record.leadId,
      ipAddress: record.ipAddress,
      userAgent: record.userAgent,
      policyVersion: record.policyVersion,
      acceptedAt: record.acceptedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };

    return Consent.fromPersistence(props);
  }

  static toCreateInput(consent: Consent): Prisma.ConsentUncheckedCreateInput {
    return {
      id: consent.id,
      sessionId: consent.sessionId,
      leadId: consent.leadId,
      ipAddress: consent.ipAddress,
      userAgent: consent.userAgent,
      policyVersion: consent.policyVersion,
      acceptedAt: consent.acceptedAt,
      createdAt: consent.createdAt,
      updatedAt: consent.updatedAt,
    };
  }

  static toUpdateInput(consent: Consent): Prisma.ConsentUncheckedUpdateInput {
    return {
      leadId: consent.leadId,
      updatedAt: consent.updatedAt,
    };
  }
}
