import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { AuditLogList } from "@/features/admin/components/AuditLogList";

export const metadata: Metadata = {
  title: "Auditoría | Bassa",
};

export default function AdminAuditPage() {
  return (
    <PageContainer>
      <Section spacing="lg">
        <div className="flex flex-col gap-6">
          <h1 className="text-heading font-bold text-foreground">Auditoría</h1>
          <AuditLogList />
        </div>
      </Section>
    </PageContainer>
  );
}
