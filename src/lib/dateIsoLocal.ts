/** Local calendar date as `YYYY-MM-DD` (no timezone shift). */
export function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function startOfLocalDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function isLocalDateAfterToday(d: Date): boolean {
  return startOfLocalDay(d).getTime() > startOfLocalDay(new Date()).getTime()
}
