import { type ComponentProps } from "react";
import { cn } from "@/lib/utils";

type PageContainerProps = ComponentProps<"div">;

/**
 * Centers page content and constrains it to the Design System's max content
 * width. Layout only — no visual styling or content decisions belong here.
 */
export function PageContainer({ className, children, ...props }: PageContainerProps) {
  return (
    <div
      className={cn("mx-auto w-full max-w-(--container-content) px-4 sm:px-6 lg:px-8", className)}
      {...props}
    >
      {children}
    </div>
  );
}
