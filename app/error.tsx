"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { logger } from "@/shared/logger/logger";

/**
 * Branded error boundary for the root segment. Never renders `error.message`
 * or any provider/stack detail — see docs/Development/Error_Handling.md.
 */
export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Unhandled client-rendered error", { digest: error.digest });
  }, [error]);

  return (
    <main>
      <PageContainer>
        <Section spacing="xl">
          <ContentWrapper>
            <div className="flex flex-col items-center gap-4 text-center">
              <h1 className="text-heading font-bold text-foreground">Something went wrong</h1>
              <p className="max-w-prose text-body text-muted-foreground">
                We hit an unexpected error. Please try again.
              </p>
              <Button onClick={reset}>Try again</Button>
            </div>
          </ContentWrapper>
        </Section>
      </PageContainer>
    </main>
  );
}
