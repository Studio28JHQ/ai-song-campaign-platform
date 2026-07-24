/**
 * Shared CSV serialization helpers for admin exports (currently Leads
 * and Consents — see `app/api/admin/leads/export/route.ts` and
 * `app/api/admin/consents/export/route.ts`). Kept generic/cross-cutting,
 * with no ties to a specific domain concept, matching
 * `src/shared/utils/index.ts`.
 */

/** Characters that, left unescaped, let a field's own text open as a formula when the exported CSV is opened in Excel/Sheets (CSV/formula injection). */
const FORMULA_TRIGGER_CHARS = new Set(["=", "+", "-", "@"]);

export function csvEscape(value: string): string {
  const safe = FORMULA_TRIGGER_CHARS.has(value[0]) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsvLine(cells: string[]): string {
  return cells.map(csvEscape).join(",") + "\n";
}
