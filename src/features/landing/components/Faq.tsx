import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { Section } from "@/components/layout/Section";

const FAQ_ITEMS = [
  {
    question: "¿Cuánto cuesta?",
    answer: "Nada. Este es un regalo de la campaña — no hay ningún pago en ningún momento.",
  },
  {
    question: "¿Cuánto tiempo tarda en llegar mi canción?",
    answer:
      "La letra está lista en instantes. Una vez que la apruebes, la canción final se genera y se envía a tu correo poco después — la mayoría llegan en minutos.",
  },
  {
    question: "¿Puedo cambiar la letra si no me gusta?",
    answer:
      "Sí. Si la letra no queda como esperabas, puedes pedir una nueva versión antes de aprobarla. Cada cuenta tiene un número limitado de intentos.",
  },
  {
    question: "¿Puedo generar más de una canción?",
    answer: "Cada correo electrónico puede generar una canción final como parte de esta campaña.",
  },
  {
    question: "¿Cómo recibo mi canción?",
    answer:
      "Tu canción terminada se envía al correo con el que te registraste, lista para escuchar.",
  },
] as const;

/**
 * Frequently asked questions. Uses native `<details>`/`<summary>` for the
 * expand/collapse behavior — fully keyboard- and screen-reader-accessible
 * with no JavaScript, so this stays a Server Component.
 */
export function Faq() {
  return (
    <Section spacing="lg">
      <ContentWrapper>
        <h2 className="text-center font-heading text-heading font-semibold text-foreground">
          Preguntas frecuentes
        </h2>

        <div className="mt-8 flex flex-col gap-3">
          {FAQ_ITEMS.map((item) => (
            <details
              key={item.question}
              className="group rounded-2xl border border-border bg-card p-5 open:border-primary/30 open:bg-secondary/40"
            >
              <summary className="cursor-pointer text-body font-semibold text-foreground marker:content-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                {item.question}
              </summary>
              <p className="mt-2 text-body text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </ContentWrapper>
    </Section>
  );
}
