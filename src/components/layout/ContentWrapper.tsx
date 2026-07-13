import { type ComponentProps } from "react";
import { cn } from "@/lib/utils";

type ContentWrapperProps = ComponentProps<"div">;

/**
 * Constrains text-heavy content to a narrower reading width than
 * `PageContainer`. Layout only — no visual styling or content decisions
 * belong here.
 */
export function ContentWrapper({ className, children, ...props }: ContentWrapperProps) {
  return (
    <div className={cn("mx-auto w-full max-w-(--container-narrow)", className)} {...props}>
      {children}
    </div>
  );
}
