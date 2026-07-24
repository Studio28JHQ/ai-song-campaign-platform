import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Consent } from "@/domain/consent/entities/Consent";
import type { ConsentRepository } from "@/domain/consent/repositories/ConsentRepository";
import { BusinessRuleError, DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";
import { ConsentMapper } from "./ConsentMapper";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

/**
 * Prisma implementation of `ConsentRepository`. No Prisma type or
 * exception ever escapes this class — callers only ever see domain
 * entities and the shared error taxonomy (`@/shared/errors`), mirroring
 * `PrismaLeadRepository`.
 */
export class PrismaConsentRepository implements ConsentRepository {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async findBySessionId(sessionId: string): Promise<Consent | null> {
    try {
      const record = await this.client.consent.findUnique({ where: { sessionId } });
      return record ? ConsentMapper.toDomain(record) : null;
    } catch (error) {
      this.handleError(error, { operation: "findBySessionId" });
    }
  }

  async create(consent: Consent): Promise<Consent> {
    try {
      const record = await this.client.consent.create({
        data: ConsentMapper.toCreateInput(consent),
      });
      return ConsentMapper.toDomain(record);
    } catch (error) {
      this.handleError(error, { operation: "create", consentId: consent.id });
    }
  }

  async update(consent: Consent): Promise<Consent> {
    try {
      const record = await this.client.consent.update({
        where: { id: consent.id },
        data: ConsentMapper.toUpdateInput(consent),
      });
      return ConsentMapper.toDomain(record);
    } catch (error) {
      this.handleError(error, { operation: "update", consentId: consent.id });
    }
  }

  private handleError(error: unknown, context: Record<string, unknown>): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        throw new BusinessRuleError("A consent record already exists for this session or lead.", {
          code: "consent.already_exists",
          cause: error,
          context,
        });
      }

      throw new DatabaseError(`Database request failed (${error.code}).`, {
        code: "consent.database_request_failed",
        cause: error,
        context: { ...context, prismaCode: error.code },
      });
    }

    throw new DatabaseError("Unexpected database error while accessing Consent data.", {
      code: "consent.unexpected_database_error",
      cause: error,
      context,
    });
  }
}
