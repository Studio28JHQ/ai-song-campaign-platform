// Sprint UI-2.5 — Campaign Asset Library.
//
// Generates optimized delivery formats for the campaign's raster
// assets, alongside their PNG masters (never overwritten, never
// resized — they stay the source of truth for editing). Re-run this
// whenever a PNG master under public/campaign/ changes:
//
//   node scripts/optimize-campaign-assets.mjs
//
// Backgrounds: AVIF (primary) + WEBP (fallback) — these are large,
// full-bleed images most likely to be used as CSS background-image,
// which never goes through next/image's own runtime optimizer, so
// pre-generating both formats here is what actually saves bytes.
//
// Products/animals: WEBP only — served through CampaignIllustration
// (next/image, reading the PNG master directly) in most app code, but
// pre-generated here too since a static WEBP is still useful outside
// next/image (raw <img>, email templates, non-Next contexts).
//
// Also prints each master's pixel dimensions, since the
// CampaignIllustration component needs accurate width/height per
// variant (next/image requires explicit dimensions to avoid layout
// shift, and won't infer them from a public/ path at build time).

import { readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.join(import.meta.dirname, "..", "public", "campaign");

const AVIF_QUALITY = 55; // visually lossless at this size class; ~80% smaller than PNG
const WEBP_QUALITY = 80;

async function pngFilesIn(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
    .map((entry) => path.join(dir, entry.name));
}

async function optimizeBackgrounds() {
  const dir = path.join(ROOT, "backgrounds");
  const files = await pngFilesIn(dir);
  for (const file of files) {
    const base = file.slice(0, -".png".length);
    const image = sharp(file);
    const { width, height } = await image.metadata();
    await image.clone().avif({ quality: AVIF_QUALITY }).toFile(`${base}.avif`);
    await image.clone().webp({ quality: WEBP_QUALITY }).toFile(`${base}.webp`);
    console.log(`background: ${path.basename(file)} (${width}x${height}) -> .avif, .webp`);
  }
}

async function optimizeWebpOnly(subfolder) {
  const dir = path.join(ROOT, subfolder);
  const files = await pngFilesIn(dir);
  for (const file of files) {
    const base = file.slice(0, -".png".length);
    const image = sharp(file);
    const { width, height } = await image.metadata();
    await image.clone().webp({ quality: WEBP_QUALITY }).toFile(`${base}.webp`);
    console.log(`${subfolder}: ${path.basename(file)} (${width}x${height}) -> .webp`);
  }
}

await optimizeBackgrounds();
await optimizeWebpOnly("products");
await optimizeWebpOnly("animals");

console.log("Done.");
