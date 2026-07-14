import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { CampaignStatus, PrismaClient } from "../src/generated/prisma/client";

/**
 * Production seed for Version 1 — creates only the one required record:
 * the default Campaign every Lead registers against (see
 * `DEFAULT_CAMPAIGN_ID` in `src/features/lead/components/RegistrationForm.tsx`
 * and `docs/Architecture/Domain_Model.md#Campaign`). Idempotent: an upsert
 * keyed on this fixed id, so running it any number of times never creates
 * a duplicate and never overwrites an already-seeded campaign's state.
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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
