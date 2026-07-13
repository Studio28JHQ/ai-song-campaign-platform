/**
 * Raw design token primitives.
 *
 * These are the atomic scales the Design System is built from. Nothing here
 * is campaign-specific — components must consume these (or the semantic
 * layer in `theme.ts`) instead of hardcoding sizes, durations, or colors.
 */

export const spacing = {
  none: "0",
  xs: "0.25rem",
  sm: "0.5rem",
  md: "1rem",
  lg: "1.5rem",
  xl: "2rem",
  "2xl": "3rem",
  "3xl": "4rem",
  "4xl": "6rem",
} as const;

export const radius = {
  none: "0",
  sm: "0.375rem",
  md: "0.625rem",
  lg: "0.875rem",
  xl: "1.25rem",
  full: "9999px",
} as const;

export const shadow = {
  none: "none",
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
} as const;

export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;

export const containerWidths = {
  sm: "40rem",
  md: "48rem",
  lg: "64rem",
  xl: "72rem",
  "2xl": "80rem",
} as const;

export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  overlay: 30,
  modal: 40,
  popover: 50,
  toast: 60,
} as const;

export const opacity = {
  disabled: 0.5,
  muted: 0.7,
  hover: 0.85,
  full: 1,
} as const;

export const duration = {
  fast: "150ms",
  base: "200ms",
  slow: "300ms",
  slower: "500ms",
} as const;

export const easing = {
  standard: "cubic-bezier(0.4, 0, 0.2, 1)",
  entrance: "cubic-bezier(0, 0, 0.2, 1)",
  exit: "cubic-bezier(0.4, 0, 1, 1)",
} as const;

/**
 * Typography scale, keyed by semantic role rather than raw size. Font
 * families stay bound to CSS variables (`theme.ts`) so the actual campaign
 * fonts can be swapped later without touching these scales.
 */
export const fontSize = {
  display: "3.5rem",
  heading: "2.25rem",
  title: "1.5rem",
  body: "1rem",
  caption: "0.875rem",
  label: "0.8125rem",
  button: "0.9375rem",
} as const;

export const lineHeight = {
  display: "1.1",
  heading: "1.2",
  title: "1.3",
  body: "1.6",
  caption: "1.4",
  label: "1.2",
  button: "1",
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;
