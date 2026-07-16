import type { Metadata } from "next";
import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { LoginForm } from "@/features/admin/components/LoginForm";

export const metadata: Metadata = {
  title: "Acceso administrativo | Bassa",
};

export default function AdminLoginPage() {
  return (
    <PageContainer>
      <Section spacing="lg">
        <ContentWrapper>
          <div className="flex flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-heading font-bold text-foreground">Administración</h1>
              <p className="text-body text-muted-foreground">Inicia sesión para continuar.</p>
            </div>

            <div className="w-full max-w-sm">
              <LoginForm />
            </div>
          </div>
        </ContentWrapper>
      </Section>
    </PageContainer>
  );
}
