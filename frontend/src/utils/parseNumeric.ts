/** Parses a possibly currency/comma-formatted number string (e.g. "$1,200.50") into a plain float. */
export function parseNumeric(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return NaN;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return NaN;
  return Number(cleaned);
}
