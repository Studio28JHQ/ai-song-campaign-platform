import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { Section } from "@/components/layout/Section";

const STEPS = [
  { title: "Regístrate", description: "Comparte tu correo y algunos datos sobre tu familia." },
  {
    title: "Cuéntanos sobre tu bebé",
    description: "Dinos el nombre de tu bebé y elige el estilo de la canción.",
  },
  {
    title: "La IA escribe la letra",
    description: "Nuestra IA crea una letra personalizada con lo que nos compartiste.",
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
    description: "Tu canción terminada llega a tu correo, lista para escuchar y guardar.",
  },
] as const;

/** The campaign flow, in order — see docs/Product/User_Flow.md — Happy Path. */
export function HowItWorks() {
  return (
    <Section spacing="lg" className="bg-muted/40">
      <ContentWrapper className="max-w-(--container-content)">
        <h2 className="text-center font-heading text-heading font-semibold text-foreground">
          Cómo funciona
        </h2>

        <ol className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-semibold text-primary-foreground"
              >
                {index + 1}
              </span>
              <h3 className="font-heading text-title font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="text-body text-muted-foreground">{step.description}</p>
            </li>
          ))}
        </ol>
      </ContentWrapper>
    </Section>
  );
}
