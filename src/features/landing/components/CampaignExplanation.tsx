import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { Section } from "@/components/layout/Section";

/** Explains what the campaign is and why it exists — see docs/Product/Product_Vision.md. */
export function CampaignExplanation() {
  return (
    <Section spacing="lg">
      <ContentWrapper>
        <div className="flex flex-col items-center gap-4 text-center">
          <h2 className="text-heading font-bold text-foreground">What is this campaign?</h2>
          <p className="max-w-prose text-body text-muted-foreground">
            For a limited time, we&apos;re giving parents the chance to receive a completely
            original song written just for their baby. You share a few details about your little
            one, our AI writes lyrics that capture the moment, and — once you approve them — turns
            them into a fully produced song you can keep forever.
          </p>
          <p className="max-w-prose text-body text-muted-foreground">
            No cost, no catch — just a small gift to celebrate your family, available only while the
            campaign runs.
          </p>
        </div>
      </ContentWrapper>
    </Section>
  );
}
