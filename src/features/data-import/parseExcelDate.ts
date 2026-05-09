/** Parse Excel inspection dates: serial numbers, ISO, DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY. */

export const DATE_YEAR_MIN = 2000
export const DATE_YEAR_MAX = 2100

const MS_PER_DAY = 86400000

/** Excel serial (whole days) → JavaScript Date (UTC ms, consistent with SheetJS-style offset). */

function utcFromWholeSerialDays(whole: number): Date {
  return new Date(Math.round((whole - 25569) * MS_PER_DAY))
}

function isReasonableCalendarDate(d: Date): boolean {
  if (Number.isNaN(d.getTime())) return false
  const y = d.getFullYear()
  return y >= DATE_YEAR_MIN && y <= DATE_YEAR_MAX
}

/**
 * Parses a sheet cell that may encode a calendar date:
 * - Native `Date` (e.g. `cellDates: true` in XLSX.read)
 * - Excel serial (day count since Excel epoch; e.g. 46305 → 2026-10-10), optional fractional day
 * - `YYYY-MM-DD`, `DD.MM.YYYY`, `DD/MM/YYYY`, `DD-MM-YYYY`
 * - Numeric strings that are Excel serials
 * - Fallback `Date.parse` when it yields a sane year range
 */

export function parseExcelDate(value: unknown): Date | null {
  if (value == null || value === "") return null

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = new Date(value.getFullYear(), value.getMonth(), value.getDate())
    return isReasonableCalendarDate(d) ? d : null
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const whole = Math.trunc(value)
    const frac = value - whole
    if (Math.abs(frac) > 1e-12 && Math.abs(frac) < 1) {
      const base = utcFromWholeSerialDays(whole)
      const withTime = new Date(base.getTime() + frac * MS_PER_DAY)
      return isReasonableCalendarDate(withTime) ? withTime : null
    }
    const d = utcFromWholeSerialDays(whole)
    return isReasonableCalendarDate(d) ? d : null
  }

  const sRaw = String(value).trim()
  if (!sRaw) return null

  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(sRaw)) {
    const n = Number(sRaw)
    return Number.isFinite(n) ? parseExcelDate(n) : null
  }

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(sRaw)
  if (iso) {
    const y = Number(iso[1])
    const m = Number(iso[2])
    const day = Number(iso[3])
    const d = new Date(y, m - 1, day)
    return isReasonableCalendarDate(d) &&
      d.getFullYear() === y &&
      d.getMonth() === m - 1 &&
      d.getDate() === day
      ? d
      : null
  }

  const dmyDots = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(sRaw)
  if (dmyDots) {
    const day = Number(dmyDots[1])
    const m = Number(dmyDots[2])
    const y = Number(dmyDots[3])
    const d = new Date(y, m - 1, day)
    return isReasonableCalendarDate(d) &&
      d.getDate() === day &&
      d.getMonth() === m - 1 &&
      d.getFullYear() === y
      ? d
      : null
  }

  const dmySlash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(sRaw)
  if (dmySlash) {
    const day = Number(dmySlash[1])
    const m = Number(dmySlash[2])
    const y = Number(dmySlash[3])
    const d = new Date(y, m - 1, day)
    return isReasonableCalendarDate(d) &&
      d.getDate() === day &&
      d.getMonth() === m - 1 &&
      d.getFullYear() === y
      ? d
      : null
  }

  const dmyHyphen = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(sRaw)
  if (dmyHyphen) {
    const day = Number(dmyHyphen[1])
    const m = Number(dmyHyphen[2])
    const y = Number(dmyHyphen[3])
    const d = new Date(y, m - 1, day)
    return isReasonableCalendarDate(d) &&
      d.getDate() === day &&
      d.getMonth() === m - 1 &&
      d.getFullYear() === y
      ? d
      : null
  }

  const asTime = Date.parse(sRaw)
  if (!Number.isNaN(asTime)) {
    const d = new Date(asTime)
    return isReasonableCalendarDate(d) ? d : null
  }

  return null
}

export function rawDateProvided(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === "number" && Number.isFinite(value)) return true
  if (value instanceof Date && !Number.isNaN(value.getTime())) return true
  return String(value).trim() !== ""
}
