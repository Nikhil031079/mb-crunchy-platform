// ============================================================================
// MB CRUNCHY - CSV / JSON export helpers (admin data tools)
// ============================================================================

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Serialize an array of objects into a CSV string. Keys of the first row are
 * used as headers (in insertion order). A UTF-8 BOM is prepended so Excel
 * renders non-ASCII characters correctly.
 */
export function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "\uFEFF";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map((h) => escapeCell(h)).join(","),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

/**
 * Trigger a client-side download of the given CSV rows.
 */
export function downloadCSV(filename: string, rows: Record<string, unknown>[]): void {
  const blob = new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8;" });
  downloadBlob(filename, blob);
}

/**
 * Trigger a client-side download of JSON data.
 */
export function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8;",
  });
  downloadBlob(filename, blob);
}

/**
 * Trigger a client-side download of arbitrary text content.
 */
export function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8;"): void {
  downloadBlob(filename, new Blob([content], { type: mime }));
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
