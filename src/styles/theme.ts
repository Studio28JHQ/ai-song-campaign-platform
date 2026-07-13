import {
  breakpoints,
  containerWidths,
  duration,
  easing,
  fontSize,
  fontWeight,
  lineHeight,
  opacity,
  radius,
  shadow,
  spacing,
  zIndex,
} from "./tokens";

/**
 * Semantic color tokens. Values are bound to the CSS custom properties
 * declared in `app/globals.css`, so a future rebrand (or dark mode) only
 * requires updating those variables — never the components that consume
 * this object.
 */
export const colors = {
  primary: "var(--primary)",
  primaryForeground: "var(--primary-foreground)",
  secondary: "var(--secondary)",
  secondaryForeground: "var(--secondary-foreground)",
  accent: "var(--accent)",
  accentForeground: "var(--accent-foreground)",
  background: "var(--background)",
  surface: "var(--card)",
  surfaceForeground: "var(--card-foreground)",
  border: "var(--border)",
  muted: "var(--muted)",
  mutedForeground: "var(--muted-foreground)",
  success: "var(--success)",
  successForeground: "var(--success-foreground)",
  warning: "var(--warning)",
  warningForeground: "var(--warning-foreground)",
  error: "var(--destructive)",
  errorForeground: "var(--destructive-foreground)",
} as const;

/**
 * Typography roles. Font families are placeholders bound to the current
 * fallback fonts until the campaign assets provide the final ones.
 */
export const typography = {
  display: {
    fontSize: fontSize.display,
    lineHeight: lineHeight.display,
    fontWeight: fontWeight.bold,
    fontFamily: "var(--font-heading)",
  },
  heading: {
    fontSize: fontSize.heading,
    lineHeight: lineHeight.heading,
    fontWeight: fontWeight.bold,
    fontFamily: "var(--font-heading)",
  },
  title: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.semibold,
    fontFamily: "var(--font-heading)",
  },
  body: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.regular,
    fontFamily: "var(--font-sans)",
  },
  caption: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    fontWeight: fontWeight.regular,
    fontFamily: "var(--font-sans)",
  },
  label: {
    fontSize: fontSize.label,
    lineHeight: lineHeight.label,
    fontWeight: fontWeight.medium,
    fontFamily: "var(--font-sans)",
  },
  button: {
    fontSize: fontSize.button,
    lineHeight: lineHeight.button,
    fontWeight: fontWeight.medium,
    fontFamily: "var(--font-sans)",
  },
} as const;

/**
 * Single entry point for the Design System. Prefer importing `theme` (or
 * the named exports above) over hardcoding values in components.
 */
export const theme = {
  colors,
  typography,
  spacing,
  radius,
  shadow,
  breakpoints,
  containerWidths,
  zIndex,
  opacity,
  duration,
  easing,
} as const;

export type Theme = typeof theme;
