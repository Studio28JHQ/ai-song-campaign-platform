import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { LeadDetailView } from "@/features/admin/components/LeadDetailView";

export const metadata: Metadata = {
  title: "Detalle de familia | Bassa",
};

interface AdminLeadDetailPageProps {
  params: Promise<{ leadId: string }>;
}

export default async function AdminLeadDetailPage({ params }: AdminLeadDetailPageProps) {
  const { leadId } = await params;

  return (
    <PageContainer>
      <Section spacing="lg">
        <div className="flex flex-col gap-4">
          <Link href="/admin/leads" className="w-fit text-sm text-primary underline">
            ← Volver a familias
          </Link>
          <LeadDetailView leadId={leadId} />
        </div>
      </Section>
    </PageContainer>
  );
}
