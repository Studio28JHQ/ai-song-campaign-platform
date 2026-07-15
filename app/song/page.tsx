import type { Metadata } from "next";
import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { appConfig } from "@/config/app";
import { SongResultView } from "@/features/song/components/SongResultView";

export const metadata: Metadata = {
  title: "Tu canción — AI Song Campaign",
};

export default function SongPage() {
  return (
    <div className="theme-campaign min-h-dvh">
      <PageContainer>
        <Section spacing="lg">
          <ContentWrapper>
            <SongResultView supportEmail={appConfig.admin.email} />
          </ContentWrapper>
        </Section>
      </PageContainer>
    </div>
  );
}
