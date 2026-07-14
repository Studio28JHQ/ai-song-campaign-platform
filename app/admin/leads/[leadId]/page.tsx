import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { LeadDetailView } from "@/features/admin/components/LeadDetailView";

export const metadata: Metadata = {
  title: "Lead Detail — AI Song Campaign Admin",
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
          <Link href="/admin/dashboard" className="w-fit text-sm text-primary underline">
            ← Back to dashboard
          </Link>
          <LeadDetailView leadId={leadId} />
        </div>
      </Section>
    </PageContainer>
  );
}
