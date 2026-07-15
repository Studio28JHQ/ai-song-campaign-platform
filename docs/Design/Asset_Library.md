# Campaign Asset Library

Sprint UI-2.5 — Campaign Asset Library. This document describes the visual asset library prepared for UI-3 to consume. **This sprint does not redesign any screen** — it normalizes, optimizes, and catalogs assets, and prepares the infrastructure (`CampaignIllustration`, font variables) UI-3 will build on. No component in the app currently renders any of the assets cataloged here.

## Folder Structure

```
public/campaign/
├── animals/          — photographic animal illustrations (PNG masters + WEBP)
├── backgrounds/       — full-bleed photographic backgrounds (PNG masters + AVIF + WEBP)
├── fonts/              — local OTF font files (client-supplied campaign typefaces)
├── icons/               — favicon and similar small fixed icons
├── illustrations/        — hand-authored flat/pastel SVG decorative illustrations
├── logo/                  — campaign/brand logo (SVG)
├── patterns/               — hand-authored tileable SVG background patterns
└── products/                — product packshot photography (PNG masters + WEBP)
```

`src/components/campaign/CampaignIllustration.tsx` is the only place `animals/`/`products/` paths are allowed to appear in code — see "CampaignIllustration Usage" below.

## Naming Convention

Every asset filename is: **lowercase, hyphen-separated (kebab-case), ASCII only, no spaces, no accents.**

Applied by converting camelCase/PascalCase boundaries to hyphens, replacing spaces/underscores with hyphens, lowercasing, and stripping diacritics — e.g. `Sensy-Derm-Infant.png` → `sensy-derm-infant.png`, `bassaLogoColor.svg` → `bassa-logo-color.svg`, `"Rounded Robin.otf"` → `rounded-robin.otf`. Files already compliant (`foca.png`, `packshot-sensyderm-crema.png`) were left unchanged.

Background photos additionally get a `background-` prefix (they're otherwise indistinguishable onomatopoeia-style names): `ba-da-ba.png` → `background-ba-da-ba.png`, `gu-gu-ga.png` → `background-gu-gu-ga.png`, `plup-pup.png` → `background-plup-pup.png`.

No category prefix was invented for animals, products, or fonts beyond what was explicitly specified — only the background prefix rule was given, so only backgrounds got one.

## Illustration Catalog

`public/campaign/illustrations/` — flat, rounded, soft, pastel SVGs (64×64 viewBox, scale freely), built from the exact `.theme-campaign` palette (`app/globals.css`, Sprint UI-2): `#8B5CF6` primary purple, `#8FD3FF` secondary blue, `#EDE9FE` lavender, `#FFB020` warm accent.

| File                    | Description                                                                |
| ----------------------- | -------------------------------------------------------------------------- |
| `stars.svg`             | Three four-pointed stars (purple, warm accent, blue), varied size          |
| `sparkles.svg`          | Three sparkle/twinkle shapes                                               |
| `heart.svg`             | Single flat rounded heart, primary purple                                  |
| `moon.svg`              | Flat crescent moon, warm accent, with two small stars                      |
| `cloud.svg`             | Flat fluffy cloud (circle union), light blue fill + outline                |
| `bubble.svg`            | Flat circle with a soft highlight, light-blue/white                        |
| `leaf.svg`              | Flat rounded leaf shape, soft green (decorative — not the `success` token) |
| `circle-decoration.svg` | Three concentric flat circles, purple gradient-by-steps (no CSS gradient)  |

All are `role="img" aria-hidden="true"` — purely decorative, no semantic content, so they're inert to assistive technology by default; a consumer that gives one actual meaning should override `aria-hidden` and add a real `<title>`/label at the call site.

## Pattern Catalog

`public/campaign/patterns/` — tileable SVG backgrounds, each built as a self-contained `<pattern>` + full-canvas `<rect>`, so the file is already a valid tile on its own (open it directly and you see the repeat).

| File              | Tile size | Description                                                    |
| ----------------- | --------- | -------------------------------------------------------------- |
| `dots.svg`        | 24×24     | Single soft-blue dot per tile — even dot grid when repeated    |
| `waves.svg`       | 60×20     | One period of a soft purple wave stroke per tile row           |
| `small-stars.svg` | 48×48     | Two small sparkle motifs (purple + blue) per tile              |
| `soft-grid.svg`   | 40×40     | Faint light-blue grid lines (`#D6EAF8`), continuous once tiled |

Usage (once UI-3 wires them in): `background-image: url(/campaign/patterns/dots.svg); background-repeat: repeat;` — no `background-size` needed, each file's own viewBox already **is** the tile.

## CSS-Only Decorations

The brief explicitly excludes these from the image asset library — they're recreated with CSS, not shipped as files, because a raster/vector asset would fix a size/blur/color that these need to flex with viewport and theme:

| Decoration       | How (Tailwind, already used in `HeroSection.tsx` — Sprint UI-2)                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud blobs      | `rounded-full blur-3xl bg-{color}/20`, absolutely positioned                                                                              |
| Floating bubbles | Same blob technique, smaller, `animate-*` if motion is added later                                                                        |
| Glows            | `blur-3xl` + a translucent gradient/solid fill behind content                                                                             |
| Soft gradients   | `bg-gradient-to-b`/inline `linear-gradient(...)` — the hero's exact 3-stop `#F8FCFF → #D9F2FF → #BEE8FF` gradient is the existing example |
| Wave separators  | An inline SVG `<path>` (not a file) sized to `100%` width between two sections, or a `clip-path` on the section boundary                  |

No new CSS utilities were added this sprint (would be a UI change, out of scope) — this table is a reference for UI-3.

## Typography

| Role             | Font          | Asset                                          | CSS Variable             | Status this sprint                       |
| ---------------- | ------------- | ---------------------------------------------- | ------------------------ | ---------------------------------------- |
| Display          | Rounded Robin | `public/campaign/fonts/rounded-robin.otf`      | `--font-display`         | Loaded, **not yet live**                 |
| Section headings | Gotham Medium | `public/campaign/fonts/gotham-medium.otf`      | `--font-section-heading` | Loaded, **not yet live**                 |
| Body             | Gotham Book   | `public/campaign/fonts/gotham-book.otf`        | `--font-body-campaign`   | Loaded, **not yet live**                 |
| —                | Myriad Pro    | `public/campaign/fonts/myriad-pro-regular.otf` | none                     | Asset kept, no loader (unused per brief) |

All three are loaded via `next/font/local` in `app/layout.tsx`, following the exact pattern already used for Fredoka/Inter (Sprint UI-1/UI-2): each exposes a CSS custom property on `<body>`, self-hosted (no network request, no layout-shift font swap beyond the font's own `display: swap`).

**"Not yet live" is intentional.** `.theme-campaign`'s actual `--font-heading`/`--font-sans` bindings (`app/globals.css`) still point at Fredoka/Inter — this sprint is explicitly "no UI redesign yet," so the three new variables exist and are ready, but nothing renders with them. Wiring `--font-heading` → `var(--font-display)`, introducing a new `--font-section-heading` token, and switching `--font-sans` → `var(--font-body-campaign)` is a UI-3 decision.

## Optimization Strategy

`scripts/optimize-campaign-assets.mjs` (uses `sharp`, already a transitive dependency) generates delivery formats **alongside**, never in place of, the PNG masters — the masters are never resized or overwritten, they stay the editable source of truth. Re-run it whenever a master changes:

```bash
node scripts/optimize-campaign-assets.mjs
```

| Category    | Master kept | Generated                     | Why                                                                                                                                                                                                                                                              |
| ----------- | ----------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backgrounds | `.png`      | `.avif` (q55) + `.webp` (q80) | Large full-bleed images, most likely used as a CSS `background-image` — that path never goes through `next/image`'s runtime optimizer, so pre-generating both formats is what actually saves bytes (measured: ~2.3–3.0 MB PNG → ~37–44 KB AVIF, ~97–98% smaller) |
| Products    | `.png`      | `.webp` (q80)                 | Served through `CampaignIllustration` (`next/image`, reads the PNG master and negotiates format at request time) in-app; the static `.webp` stays available for non-`next/image` consumers (measured: ~220–320 KB → ~23–31 KB, ~90% smaller)                     |
| Animals     | `.png`      | `.webp` (q80)                 | Same reasoning as Products (measured: ~580–930 KB → ~44–72 KB, ~90–92% smaller)                                                                                                                                                                                  |

No visible quality loss at these quality settings for photographic content at this size class; masters remain available for any future re-encode at different settings.

## CampaignIllustration Usage

`src/components/campaign/CampaignIllustration.tsx` is the single source of truth for animal/product asset paths — no other file should hardcode a `/campaign/animals/...` or `/campaign/products/...` string.

```tsx
import { CampaignIllustration } from "@/components/campaign/CampaignIllustration";

<CampaignIllustration variant="penguin" className="h-40 w-auto" />
<CampaignIllustration variant="product-crema" priority sizes="(min-width: 768px) 320px, 60vw" />
```

- `variant`: one of `penguin` | `seal` | `booby` | `product-blue` | `product-crema` | `product-infant`.
- Internally renders `next/image` with the PNG master's real intrinsic `width`/`height` (no upscaling, no manual resizing) and a sensible Spanish `alt`, overridable via the `alt` prop.
- Every other `next/image` prop (`className`, `sizes`, `priority`, `style`, ...) passes straight through — callers control responsive `sizes` and layout; the component only owns "where is this asset and what is it called."
- Backgrounds (`public/campaign/backgrounds/`) and decorative SVGs (`illustrations/`, `patterns/`) are intentionally **not** part of this component — they're typically CSS `background-image`s or directly-embedded SVGs, not `<img>`-shaped content with a natural aspect ratio to preserve.

## Future Image Loading Rule (for UI-3 and beyond)

Every future component that renders a campaign photo must go through `next/image` — either directly, or via `CampaignIllustration` for animals/products. Never manually resize an image (no pre-cropped variants beyond what this sprint generated); pass `sizes` and let Next.js's built-in image optimizer negotiate format/resolution per request.
