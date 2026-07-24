import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { ConsentsList } from "@/features/admin/components/ConsentsList";

export const metadata: Metadata = {
  title: "Consentimientos | Bassa",
};

/** Feature 1 — Consent Management Screen. Read-only: latest 20 Consent records plus a full-table CSV export. */
export default function AdminConsentsPage() {
  return (
    <PageContainer>
      <Section spacing="lg">
        <div className="flex flex-col gap-6">
          <h1 className="text-heading font-bold text-foreground">Consentimientos</h1>
          <ConsentsList />
        </div>
      </Section>
    </PageContainer>
  );
}
