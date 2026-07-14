import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { Section } from "@/components/layout/Section";

/** Required campaign disclosures — see docs/Product/Product_Vision.md (one-month, capped, temporary campaign). */
export function LegalDisclaimer() {
  return (
    <Section spacing="sm">
      <ContentWrapper>
        <p className="text-caption text-muted-foreground">
          This is a limited-time promotional campaign and is not an ongoing product or service.
          Songs are generated with the help of artificial intelligence based on the information you
          provide; content is reviewed automatically before generation. One song is available per
          email address, while campaign capacity lasts. By registering, you consent to being
          contacted at the email address you provide for the sole purpose of delivering your
          personalized song.
        </p>
      </ContentWrapper>
    </Section>
  );
}
