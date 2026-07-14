import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { CampaignStatus, PrismaClient } from "../src/generated/prisma/client";

/**
 * Production seed for Version 1 — creates only the static catalog records
 * the application has no other way to create: the default Campaign every
 * Lead registers against, and the four fixed Moods the Lyrics Review
 * screen lets a user pick from (see
 * `docs/Architecture/Domain_Model.md#Campaign` /`#Mood`, and the schema
 * audit in the commit this file is part of for why every other table is
 * excluded — most are pure application data, and `AdminUser` is
 * deliberately provisioned manually, never via a committed seed, since
 * that would mean checking a credential into source control).
 *
 * Idempotent: every record is an upsert keyed on its fixed id, so running
 * this any number of times never creates a duplicate and never overwrites
 * already-seeded state.
 *
 * Reads `CAMPAIGN_NAME`/`CAMPAIGN_MAX_SONGS` directly from `process.env`
 * (the same existing values `src/config/env.ts` validates for the running
 * application) rather than through `@/config/app`, so this standalone
 * script only depends on the two variables it actually needs, not the
 * full application configuration (Claude/Suno/Resend/R2 credentials the
 * seed step has no reason to require).
 */

const DEFAULT_CAMPAIGN_ID = "00000000-0000-0000-0000-000000000000";
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000; // "Campaign duration: One month." — docs/Product/Product_Vision.md

/**
 * The four predefined moods (see `docs/Product/Business_Rules.md` — Mood
 * Rules). ids/names/descriptions match the fixed placeholder list in
 * `src/features/lyrics/components/LyricsGenerationForm.tsx` exactly — that
 * list is what a user's selection actually sends as `moodId`, so these
 * must line up 1:1. `sunoPrompt` reuses each mood's own existing
 * `description` text verbatim rather than inventing new creative copy.
 */
const MOODS = [
  {
    id: "10000000-0000-0000-0000-000000000001",
    name: "Joyful",
    description: "upbeat and cheerful",
  },
  { id: "10000000-0000-0000-0000-000000000002", name: "Calm", description: "soft and soothing" },
  {
    id: "10000000-0000-0000-0000-000000000003",
    name: "Playful",
    description: "fun and bouncy",
  },
  {
    id: "10000000-0000-0000-0000-000000000004",
    name: "Sentimental",
    description: "warm and heartfelt",
  },
] as const;

async function main(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const name = process.env.CAMPAIGN_NAME || "AI Song Campaign";
  const maximumSongs = Number(process.env.CAMPAIGN_MAX_SONGS) || 3000;
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + ONE_MONTH_MS);

  try {
    const campaign = await prisma.campaign.upsert({
      where: { id: DEFAULT_CAMPAIGN_ID },
      update: {},
      create: {
        id: DEFAULT_CAMPAIGN_ID,
        name,
        status: CampaignStatus.ACTIVE,
        maximumSongs,
        songsGenerated: 0,
        startsAt,
        endsAt,
        isGenerationEnabled: true,
      },
    });

    console.log(
      `Seed complete — campaign "${campaign.name}" (${campaign.id}) is ${campaign.status}.`,
    );

    for (const [index, mood] of MOODS.entries()) {
      const seededMood = await prisma.mood.upsert({
        where: { id: mood.id },
        update: {},
        create: {
          id: mood.id,
          name: mood.name,
          description: mood.description,
          sunoPrompt: mood.description,
          displayOrder: index,
          active: true,
        },
      });

      console.log(`Seed complete — mood "${seededMood.name}" (${seededMood.id}) is active.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
