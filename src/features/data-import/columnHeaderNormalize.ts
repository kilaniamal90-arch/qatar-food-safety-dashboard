/**
 * Normalize workbook column titles so smart-mapping matches Excel quirks
 * (line breaks inside cells, trailing spaces, NBSP, etc.).
 */

export function cleanExcelColumnHeader(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Clean + lowercase — use for SMART_MAP lookup keys only. */

export function normalizeColumnHeaderForMatch(raw: string): string {
  return cleanExcelColumnHeader(raw).toLowerCase()
}

/**
 * Stable unique keys when two columns clean to the same label (sheet_to_json shape).
 */

export function uniquifyExcelHeaders(headers: string[]): string[] {
  const counts = new Map<string, number>()
  const out: string[] = []

  for (const h of headers) {
    const base = h === "" ? "__" : h
    const seen = counts.get(base) ?? 0
    counts.set(base, seen + 1)
    if (seen === 0) {
      out.push(h === "" ? "__" : h)
    } else {
      out.push(`${base} (${seen + 1})`)
    }
  }
  return out
}
