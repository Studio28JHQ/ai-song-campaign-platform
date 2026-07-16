import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { SongsList } from "@/features/admin/components/SongsList";

export const metadata: Metadata = {
  title: "Canciones | Bassa",
};

export default function AdminSongsPage() {
  return (
    <PageContainer>
      <Section spacing="lg">
        <div className="flex flex-col gap-6">
          <h1 className="text-heading font-bold text-foreground">Canciones</h1>
          <SongsList />
        </div>
      </Section>
    </PageContainer>
  );
}
