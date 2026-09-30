import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { SharesOverview } from "@/features/admin/components/SharesOverview";

export const metadata: Metadata = {
  title: "Compartidos | Bassa",
};

/** Share Tracking — recorded share attempts per platform, per day, plus a full CSV export. */
export default function AdminSharesPage() {
  return (
    <PageContainer>
      <Section spacing="lg">
        <div className="flex flex-col gap-6">
          <h1 className="text-heading font-bold text-foreground">Compartidos</h1>
          <SharesOverview />
        </div>
      </Section>
    </PageContainer>
  );
}
