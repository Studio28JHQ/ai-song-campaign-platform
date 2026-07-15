# Design System

This document describes the design principles and visual language behind the campaign's UI foundation. It is a companion to `docs/Architecture/System_Architecture.md` and `docs/Architecture/Folder_Structure.md` — this file explains the _why_ of the design language; the token and component code under `src/styles/` and `src/components/` is the _how_.

## Design Principles

- **One campaign, one look.** The Design System exists to serve a single, temporary campaign — not a general-purpose product. It favors a small, coherent set of reusable primitives over a large, speculative component library.
- **Tokens before components.** Every visual decision (color, type, spacing, motion) is expressed as a token first. Components consume tokens; they never encode raw values themselves.
- **Themeable without rewrites.** The campaign's branding assets have not been finalized. The system is built so that swapping colors, fonts, or spacing later is a token-level change, not a component-level rewrite.
- **Small, composable primitives.** Layout and UI primitives stay narrow in responsibility (layout only, or presentation only) so campaign features can be composed on top of them without fighting the foundation.

## Color Philosophy

Colors are named by role, not by appearance — `primary`, `secondary`, `accent`, `background`, `surface`, `border`, `muted`, `success`, `warning`, `error` — so that a component asking for "the primary action color" keeps working even after the actual color value changes when campaign branding is finalized.

The campaign brand palette (soft blues, white, purple accents — Sprint UI-1) is scoped to `.theme-campaign` in `app/globals.css`, applied once at the root of each public-facing page. `:root`'s own tokens (the original neutral palette) are deliberately left untouched, since the admin panel uses the exact same semantic token names and must render unaffected by the public rebrand. No component or feature should hardcode a color value; everything routes through the semantic color tokens, which is precisely what makes this scoping possible without touching a single component.

## Typography Hierarchy

Typography is organized by role rather than by raw font size: `display`, `heading`, `title`, `body`, `caption`, `label`, `button`. Each role captures a complete, consistent combination of size, line height, and weight for that purpose (e.g. a page's single dominant statement vs. a form field's caption text).

Public-facing headings (`h1`–`h3` within `.theme-campaign`) use a warm, rounded display face (Fredoka) layered on top of the same type scale — only the font-family binding changed, not the roles or their sizes. Body text and the admin panel keep the original sans-serif binding.

## Spacing System

Spacing follows a single consistent scale rather than arbitrary, one-off values. Using a fixed scale keeps vertical and horizontal rhythm predictable across the Landing Page and admin panel, and makes visual inconsistency easy to spot in review (a value outside the scale stands out immediately).

## Responsive Strategy

The system assumes a mobile-first campaign audience (parents on phones as much as desktops). Layout primitives constrain content width at defined breakpoints rather than letting content stretch arbitrarily on large screens, and spacing/typography scale predictably rather than requiring bespoke per-breakpoint overrides in feature code.

## Accessibility Considerations

- Semantic color roles are paired with foreground counterparts (e.g. `primary` / `primary-foreground`) specifically to preserve contrast as the palette evolves.
- The system supports light and dark modes at the token level so accessibility isn't a per-component afterthought.
- Typography roles preserve a minimum readable line-height and size floor appropriate to their purpose (e.g. `caption` and `label` are never sized below a legible threshold).
- Layout primitives avoid fixed pixel widths that would break reflow or zoom; content widths are expressed as scalable units.

## Component Philosophy

- **Layout components** (`PageContainer`, `Section`, `ContentWrapper`) control structure and rhythm only. They know nothing about campaign content and accept no business data.
- **UI components** (`src/components/ui/`) will hold presentation primitives (e.g. shadcn/ui-based building blocks) added only as features require them — the library starts empty and grows on demand, not speculatively.
- **Feature components** (landing sections, forms, campaign-specific UI) are explicitly out of scope for the Design System and belong in `src/features/` once campaign work begins.
