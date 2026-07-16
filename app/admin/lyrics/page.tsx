import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { LyricsList } from "@/features/admin/components/LyricsList";

export const metadata: Metadata = {
  title: "Letras | Bassa",
};

export default function AdminLyricsPage() {
  return (
    <PageContainer>
      <Section spacing="lg">
        <div className="flex flex-col gap-6">
          <h1 className="text-heading font-bold text-foreground">Letras</h1>
          <LyricsList />
        </div>
      </Section>
    </PageContainer>
  );
}
