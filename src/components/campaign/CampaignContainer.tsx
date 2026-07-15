import { type ComponentProps } from "react";
import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { PageContainer } from "@/components/layout/PageContainer";

interface CampaignContainerProps extends ComponentProps<"div"> {
  /** Narrower, reading-width container (`ContentWrapper`) instead of the full content width (`PageContainer`, the default). */
  narrow?: boolean;
}

/**
 * Sprint UI-3A — Landing Experience. The landing page's own container
 * name, so every new `Campaign*` component composes from a single
 * source instead of reaching into `src/components/layout/` directly —
 * but it never reimplements width/padding logic itself, only delegates
 * to the existing `PageContainer`/`ContentWrapper` primitives ("Do not
 * duplicate layout code").
 */
export function CampaignContainer({ narrow, ...props }: CampaignContainerProps) {
  const Container = narrow ? ContentWrapper : PageContainer;
  return <Container {...props} />;
}
