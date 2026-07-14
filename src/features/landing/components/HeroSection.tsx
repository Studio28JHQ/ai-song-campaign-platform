import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { Section } from "@/components/layout/Section";
import { buttonVariants } from "@/components/ui/button";

/**
 * The landing page's above-the-fold section. A plain anchor link (not a
 * client-side scroll handler) drives the primary CTA, so this stays a
 * Server Component with zero JavaScript of its own — the only client
 * code on the page is the existing `RegistrationForm` island further
 * down (see docs/Product/User_Flow.md).
 */
export function HeroSection() {
  return (
    <Section spacing="xl" className="bg-muted/30">
      <ContentWrapper>
        <div className="flex flex-col items-center gap-6 text-center">
          <div
            aria-hidden
            className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground"
          >
            ♪
          </div>

          <h1 className="max-w-2xl text-display font-bold text-foreground">
            A personalized song, written for your baby
          </h1>

          <p className="max-w-prose text-body text-muted-foreground">
            Tell us a little about your family, and our AI will write and produce a one-of-a-kind
            song for your little one — free, in minutes, delivered straight to your inbox.
          </p>

          <a href="#register" className={buttonVariants({ size: "lg" })}>
            Create your baby&apos;s song
          </a>
        </div>
      </ContentWrapper>
    </Section>
  );
}
