import { ContentWrapper } from "@/components/layout/ContentWrapper";
import { Section } from "@/components/layout/Section";

const FAQ_ITEMS = [
  {
    question: "How much does it cost?",
    answer: "Nothing. This is a free campaign gift — there is no payment at any step.",
  },
  {
    question: "How long does it take to get my song?",
    answer:
      "Lyrics are ready in moments. Once you approve them, the final song is generated and emailed to you shortly after — most songs arrive within minutes.",
  },
  {
    question: "Can I change the lyrics if I don't like them?",
    answer:
      "Yes. If the lyrics aren't quite right, you can request a new version before approving. Each account has a limited number of attempts.",
  },
  {
    question: "Can I generate more than one song?",
    answer: "Each email address can generate one final song as part of this campaign.",
  },
  {
    question: "How will I receive my song?",
    answer: "Your finished song is emailed to the address you registered with, ready to play.",
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
        <h2 className="text-center text-heading font-bold text-foreground">
          Frequently asked questions
        </h2>

        <div className="mt-8 flex flex-col gap-3">
          {FAQ_ITEMS.map((item) => (
            <details
              key={item.question}
              className="group rounded-lg border border-border p-4 open:bg-muted/30"
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
