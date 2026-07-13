import type { PrismaClient } from "@/generated/prisma/client";
import type {
  MoodDetails,
  MoodSunoPromptProvider,
} from "@/application/song/contracts/MoodSunoPromptProvider";
import { DatabaseError } from "@/shared/errors";
import { prisma as defaultPrismaClient } from "../client";

/**
 * Thin, single-purpose Prisma lookup satisfying the
 * `MoodSunoPromptProvider` port. There is no Mood domain module (out of
 * scope for this task), so this is a narrow adapter over one query — not
 * a full repository.
 */
export class PrismaMoodSunoPromptProvider implements MoodSunoPromptProvider {
  constructor(private readonly client: PrismaClient = defaultPrismaClient) {}

  async getMoodDetails(moodId: string): Promise<MoodDetails | null> {
    try {
      const mood = await this.client.mood.findUnique({
        where: { id: moodId },
        select: { name: true, sunoPrompt: true },
      });

      return mood ? { name: mood.name, sunoPrompt: mood.sunoPrompt } : null;
    } catch (error) {
      throw new DatabaseError("Unexpected database error while looking up a mood.", {
        code: "song.unexpected_database_error",
        cause: error,
        context: { operation: "getMoodDetails", moodId },
      });
    }
  }
}
