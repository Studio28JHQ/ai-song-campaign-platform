import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";

/** Branded 404 — shown for any unmatched route. */
export default function NotFound() {
  return (
    <main>
      <PageContainer>
        <Section spacing="xl">
          <ContentWrapper>
            <div className="flex flex-col items-center gap-4 text-center">
              <h1 className="text-heading font-bold text-foreground">Página no encontrada</h1>
              <p className="max-w-prose text-body text-muted-foreground">
                La página que buscas no existe o pudo haberse movido.
              </p>
              <Link href="/" className={buttonVariants({ size: "lg" })}>
                Volver al inicio
              </Link>
            </div>
          </ContentWrapper>
        </Section>
      </PageContainer>
    </main>
  );
}
