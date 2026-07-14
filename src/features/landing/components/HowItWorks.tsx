import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { Section } from "@/components/layout/Section";

const STEPS = [
  { title: "Register", description: "Share your email and a few details about your family." },
  {
    title: "Describe the baby",
    description: "Tell us your baby's name and pick the mood for the song.",
  },
  {
    title: "AI generates lyrics",
    description: "Our AI writes personalized lyrics based on what you shared.",
  },
  {
    title: "You approve the lyrics",
    description: "Review the lyrics and approve them, or ask for a new version.",
  },
  {
    title: "AI generates the song",
    description: "Once approved, the lyrics are turned into a fully produced song.",
  },
  {
    title: "Delivered by email",
    description: "Your finished song is emailed to you, ready to play and keep.",
  },
] as const;

/** The campaign flow, in order — see docs/Product/User_Flow.md — Happy Path. */
export function HowItWorks() {
  return (
    <Section spacing="lg">
      <ContentWrapper className="max-w-(--container-content)">
        <h2 className="text-center text-heading font-bold text-foreground">How it works</h2>

        <ol className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-2 rounded-xl border border-border bg-background p-6"
            >
              <span
                aria-hidden
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
              >
                {index + 1}
              </span>
              <h3 className="text-title font-semibold text-foreground">{step.title}</h3>
              <p className="text-body text-muted-foreground">{step.description}</p>
            </li>
          ))}
        </ol>
      </ContentWrapper>
    </Section>
  );
}
