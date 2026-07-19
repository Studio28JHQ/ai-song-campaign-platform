import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Lead } from "@/domain/lead/entities/Lead";
import type { LeadRepository } from "@/domain/lead/repositories/LeadRepository";
import type { Email } from "@/domain/lead/value-objects/Email";
import { BusinessRuleError, DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";
import { LeadMapper } from "./LeadMapper";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

/**
 * Prisma implementation of `LeadRepository`. No Prisma type or exception
 * ever escapes this class — callers only ever see domain entities and the
 * shared error taxonomy (`@/shared/errors`).
 */
export class PrismaLeadRepository implements LeadRepository {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async findById(id: string): Promise<Lead | null> {
    try {
      const record = await this.client.lead.findUnique({ where: { id } });
      return record ? LeadMapper.toDomain(record) : null;
    } catch (error) {
      this.handleError(error, { operation: "findById", id });
    }
  }

  async findByEmail(email: Email): Promise<Lead | null> {
    try {
      const record = await this.client.lead.findUnique({
        where: { email: email.toString() },
      });
      return record ? LeadMapper.toDomain(record) : null;
    } catch (error) {
      this.handleError(error, { operation: "findByEmail" });
    }
  }

  async existsByEmail(email: Email): Promise<boolean> {
    try {
      const count = await this.client.lead.count({ where: { email: email.toString() } });
      return count > 0;
    } catch (error) {
      this.handleError(error, { operation: "existsByEmail" });
    }
  }

  async findByResumeToken(token: string): Promise<Lead | null> {
    try {
      const record = await this.client.lead.findUnique({ where: { resumeToken: token } });
      return record ? LeadMapper.toDomain(record) : null;
    } catch (error) {
      this.handleError(error, { operation: "findByResumeToken" });
    }
  }

  async create(lead: Lead): Promise<Lead> {
    try {
      const record = await this.client.lead.create({ data: LeadMapper.toCreateInput(lead) });
      return LeadMapper.toDomain(record);
    } catch (error) {
      this.handleError(error, { operation: "create", leadId: lead.id });
    }
  }

  async update(lead: Lead): Promise<Lead> {
    try {
      const record = await this.client.lead.update({
        where: { id: lead.id },
        data: LeadMapper.toUpdateInput(lead),
      });
      return LeadMapper.toDomain(record);
    } catch (error) {
      this.handleError(error, { operation: "update", leadId: lead.id });
    }
  }

  async updateAttemptConsumption(
    lead: Lead,
    expectedRemainingAttempts: number,
  ): Promise<Lead | null> {
    try {
      const result = await this.client.lead.updateMany({
        where: { id: lead.id, remainingAttempts: expectedRemainingAttempts },
        data: LeadMapper.toUpdateInput(lead),
      });

      if (result.count !== 1) {
        return null;
      }

      return this.findById(lead.id);
    } catch (error) {
      this.handleError(error, { operation: "updateAttemptConsumption", leadId: lead.id });
    }
  }

  private handleError(error: unknown, context: Record<string, unknown>): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        throw new BusinessRuleError("This email has already been used to register a lead.", {
          code: "lead.email_already_registered",
          cause: error,
          context,
        });
      }

      throw new DatabaseError(`Database request failed (${error.code}).`, {
        code: "lead.database_request_failed",
        cause: error,
        context: { ...context, prismaCode: error.code },
      });
    }

    throw new DatabaseError("Unexpected database error while accessing Lead data.", {
      code: "lead.unexpected_database_error",
      cause: error,
      context,
    });
  }
}
