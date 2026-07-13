import { type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const sectionVariants = cva("w-full", {
  variants: {
    spacing: {
      sm: "py-8",
      md: "py-12",
      lg: "py-16",
      xl: "py-24",
    },
  },
  defaultVariants: {
    spacing: "md",
  },
});

type SectionProps = ComponentProps<"section"> & VariantProps<typeof sectionVariants>;

/**
 * Vertical rhythm wrapper for page sections. Layout only — no visual
 * styling or content decisions belong here.
 */
export function Section({ className, spacing, children, ...props }: SectionProps) {
  return (
    <section className={cn(sectionVariants({ spacing }), className)} {...props}>
      {children}
    </section>
  );
}
