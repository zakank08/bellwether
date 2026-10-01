/** Minimal CSV writer: quotes any field with a comma, quote or line break. */
export const csvCell = (v: unknown) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const csvRow = (cells: unknown[]) => cells.map(csvCell).join(",");
export const csvResponse = (lines: string[], filename: string) =>
  new Response(lines.join("\r\n") + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `inline; filename="${filename}"` } });
