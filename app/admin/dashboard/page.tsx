import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { AdminDashboard } from "@/features/admin/components/AdminDashboard";

export const metadata: Metadata = {
  title: "Admin Dashboard — AI Song Campaign",
};

/**
 * Unlike the parent-facing pages, this page skips `ContentWrapper` — that
 * component narrows content to a comfortable reading width, which would
 * needlessly cramp the participants table below.
 */
export default function AdminDashboardPage() {
  return (
    <PageContainer>
      <Section spacing="lg">
        <AdminDashboard />
      </Section>
    </PageContainer>
  );
}
