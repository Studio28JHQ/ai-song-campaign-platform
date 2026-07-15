import Image from "next/image";
import { CampaignContainer } from "@/components/campaign/CampaignContainer";

interface LandingFooterProps {
  campaignName: string;
}

/** The page footer. `campaignName` is passed down from `app/page.tsx` (which may read `NEXT_PUBLIC_APP_NAME`) rather than read here, since this component stays a plain presentational Server Component. */
export function LandingFooter({ campaignName }: LandingFooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border py-10">
      <CampaignContainer className="flex flex-col items-center gap-4">
        <Image src="/campaign/logo/bassa-logo-color.svg" alt="Bassa" width={110} height={34} />
        <p className="text-center text-caption text-muted-foreground">
          &copy; {year} {campaignName}. Todos los derechos reservados.
        </p>
      </CampaignContainer>
    </footer>
  );
}
