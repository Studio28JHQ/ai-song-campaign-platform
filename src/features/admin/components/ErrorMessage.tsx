/**
 * Sprint FINAL-3 — Dashboard Stabilization. The one error-banner style
 * every admin screen already used inline, independently, in a dozen
 * places — extracted so it's consistent by construction. `size`
 * "sm" is for a localized, per-widget error (Dashboard sections);
 * default is the full-width screen-level error every list already had.
 */
export function ErrorMessage({
  message,
  size = "default",
}: {
  message: string;
  size?: "default" | "sm";
}) {
  return (
    <p
      role="alert"
      className={
        size === "sm"
          ? "rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
          : "rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
      }
    >
      {message}
    </p>
  );
}
