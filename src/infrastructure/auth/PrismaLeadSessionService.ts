import { randomBytes } from "crypto";
import type {
  IssuedLeadSession,
  LeadSessionService,
} from "@/application/lead/contracts/LeadSessionService";
import { prisma as defaultPrismaClient } from "../persistence/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

const TOKEN_BYTE_LENGTH = 32; // 256 bits, cryptographically secure — see crypto.randomBytes.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — matches the one-month campaign duration (docs/Product/Product_Vision.md).

/**
 * DB-backed, opaque session token for the parent-facing flow (see
 * `LeadSessionService`). Deliberately stateful/lookup-based — unlike the
 * Admin module's stateless, signed `SignedSessionTokenService` — so a
 * session can be revoked/expired server-side without needing a shared
 * secret to also be rotated. The browser only ever holds the random
 * `token`; `leadId` never crosses the network.
 */
export class PrismaLeadSessionService implements LeadSessionService {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async create(leadId: string): Promise<IssuedLeadSession> {
    const token = randomBytes(TOKEN_BYTE_LENGTH).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.client.leadSession.create({
      data: { token, leadId, expiresAt },
    });

    return { token, expiresAt };
  }

  async resolve(token: string): Promise<string | null> {
    if (!token) return null;

    const session = await this.client.leadSession.findUnique({ where: { token } });
    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;

    return session.leadId;
  }
}
