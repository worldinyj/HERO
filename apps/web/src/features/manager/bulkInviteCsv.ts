/** Safe spreadsheet export of values obtained from user-supplied CSV.
 * Quotes alone do not stop Excel/Sheets formula evaluation. Prefix any cell
 * starting with a formula sigil (allowing leading whitespace/control chars)
 * with a literal apostrophe before normal CSV escaping.
 */
export function csvEscape(value: string): string {
  const formula = /^[\s\u0000-\u001f]*[=+\-@]/u.test(value);
  const safeValue = formula ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}
