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
    <Section
      spacing="xl"
      className="relative overflow-hidden bg-gradient-to-b from-secondary/60 via-background to-background"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 h-72 bg-gradient-to-br from-primary/20 via-accent/15 to-transparent blur-3xl"
      />
      <ContentWrapper className="relative">
        <div className="flex flex-col items-center gap-7 text-center">
          <div
            aria-hidden
            className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-accent text-3xl font-semibold text-primary-foreground shadow-lg shadow-primary/25"
          >
            ♪
          </div>

          <h1 className="max-w-2xl font-heading text-display font-semibold text-foreground">
            Una canción única, creada especialmente para tu bebé
          </h1>

          <p className="max-w-prose text-body text-muted-foreground">
            Cuéntanos un poco sobre tu familia y nuestra IA escribirá y producirá una canción
            irrepetible para tu pequeño — gratis, en minutos, directo a tu correo.
          </p>

          <a
            href="#register"
            className={buttonVariants({
              size: "lg",
              className: "h-12 rounded-full px-8 text-base",
            })}
          >
            Crear la canción de mi bebé
          </a>
        </div>
      </ContentWrapper>
    </Section>
  );
}
