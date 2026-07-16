import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { AdminUsersList } from "@/features/admin/components/AdminUsersList";

export const metadata: Metadata = {
  title: "Administradores | Bassa",
};

export default function AdminUsersPage() {
  return (
    <PageContainer>
      <Section spacing="lg">
        <div className="flex flex-col gap-6">
          <h1 className="text-heading font-bold text-foreground">Administradores</h1>
          <AdminUsersList />
        </div>
      </Section>
    </PageContainer>
  );
}
