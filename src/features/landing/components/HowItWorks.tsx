import { CampaignCard } from "@/components/campaign/CampaignCard";
import { CampaignContainer } from "@/components/campaign/CampaignContainer";
import { CampaignHeading } from "@/components/campaign/CampaignHeading";
import { CampaignSection } from "@/components/campaign/CampaignSection";

const STEPS = [
  { title: "Regístrate", description: "Comparte tu correo y algunos datos sobre tu familia." },
  {
    title: "Cuéntanos sobre tu bebé",
    description: "Dinos el nombre de tu bebé y elige el estilo de la canción.",
  },
  {
    title: "La IA escribe la letra",
    description: "Escribimos, con cariño, una letra pensada solo para tu pequeño.",
  },
  {
    title: "Tú apruebas la letra",
    description: "Revisa la letra y apruébala, o pide una nueva versión.",
  },
  {
    title: "La IA crea la canción",
    description: "Una vez aprobada, la letra se convierte en una canción totalmente producida.",
  },
  {
    title: "La recibes por correo",
    description: "Tu canción terminada llega a tu correo, lista para escuchar y atesorar.",
  },
] as const;

/** The campaign flow, in order — see docs/Product/User_Flow.md — Happy Path. */
export function HowItWorks() {
  return (
    <CampaignSection tone="muted">
      <CampaignContainer>
        <CampaignHeading as="h2" variant="section" className="text-center">
          Cómo funciona
        </CampaignHeading>

        <ol className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, index) => (
            <CampaignCard
              key={step.title}
              as="li"
              className="flex flex-col gap-3 transition-shadow hover:shadow-[0_12px_36px_rgba(139,92,246,0.14)]"
            >
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-semibold text-primary-foreground"
              >
                {index + 1}
              </span>
              <CampaignHeading as="h3" variant="title">
                {step.title}
              </CampaignHeading>
              <p className="text-body text-muted-foreground">{step.description}</p>
            </CampaignCard>
          ))}
        </ol>
      </CampaignContainer>
    </CampaignSection>
  );
}
