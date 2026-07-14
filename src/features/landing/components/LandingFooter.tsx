import { ContentWrapper } from "@/components/layout/ContentWrapper";

interface LandingFooterProps {
  campaignName: string;
}

/** The page footer. `campaignName` is passed down from `app/page.tsx` (which may read `NEXT_PUBLIC_APP_NAME`) rather than read here, since this component stays a plain presentational Server Component. */
export function LandingFooter({ campaignName }: LandingFooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border py-8">
      <ContentWrapper>
        <p className="text-center text-caption text-muted-foreground">
          &copy; {year} {campaignName}. All rights reserved.
        </p>
      </ContentWrapper>
    </footer>
  );
}
