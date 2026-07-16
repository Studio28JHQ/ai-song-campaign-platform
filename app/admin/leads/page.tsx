import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { LeadSearchTable } from "@/features/admin/components/LeadSearchTable";

export const metadata: Metadata = {
  title: "Familias | Bassa",
};

/**
 * Sprint ADMIN-1 — Backoffice de Campaña. "Familias" in the sidebar —
 * the existing, unmodified `LeadSearchTable` (search/filters/export),
 * moved here from the Dashboard so each sidebar entry maps to one
 * screen, not duplicated. Same component, same behavior, same
 * `GET /api/admin/leads` — only its page changed.
 */
export default function AdminLeadsPage() {
  return (
    <PageContainer>
      <Section spacing="lg">
        <div className="flex flex-col gap-6">
          <h1 className="text-heading font-bold text-foreground">Familias</h1>
          <LeadSearchTable />
        </div>
      </Section>
    </PageContainer>
  );
}
