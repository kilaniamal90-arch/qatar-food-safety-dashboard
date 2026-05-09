/** Deterministic pseudo-random for repeatable mock datasets. */
function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick =
  (rng: () => number) =>
  <T,>(items: readonly T[]): T =>
    items[Math.floor(rng() * items.length)]!

export type EstablishmentStatus = "Open" | "Closed" | "Under Review"

export type Establishment = {
  id: number
  name: string
  crNumber: string
  area: string
  location: string
  status: EstablishmentStatus
  activityType: string
}

export type InspectionRating =
  | "Excellent"
  | "Very Good"
  | "Good"
  | "Fair"
  | "Poor"

export type Inspection = {
  establishmentName: string
  date: Date
  rating: InspectionRating
  inspector: string
  refNumber: string
}

export const AREAS = [
  "Katara",
  "West Bay",
  "Lusail",
  "The Pearl",
  "Al Rayyan",
  "Al Waab",
  "Al Sadd",
  "Old Airport",
  "Al Wakrah",
  "Mesaieed",
] as const

export const ACTIVITY_TYPES = [
  "Restaurant",
  "Café",
  "Hotel",
  "Catering",
  "Bakery",
  "Food Manufacturing",
  "Staff Accommodation Kitchen",
] as const

const ESTABLISHMENT_NAMES = [
  "Bayt El Talleh",
  "Al Shami Kitchen",
  "Pearl Harbor Grill",
  "Lusail Central Café",
  "Rayyan Fresh Market",
  "West Bay Bistro",
  "Doha Heritage Kitchen",
  "Gold Souq Treats",
  "Aspire Healthy Bites",
  "Sealine Fish House",
  "Hamad Hospitality Suite",
  "Al Waab Family Restaurant",
  "Education City Eats",
  "Msheireb Urban Café",
  "Wakrah Waterfront Dining",
] as const

const INSPECTORS = [
  "Marwen Loulen",
  "Fatima Al-Kuwari",
  "Hassan Al-Mutawa",
  "Noora Al-Sulaiti",
  "Patrick O'Neill",
  "Aisha Al-Mannai",
  "Omar Al-Emadi",
  "Layla Al-Mohannadi",
  "James Malik",
  "Sara Al-Hajri",
] as const

const WEIGHTED_RATINGS: InspectionRating[] = [
  "Excellent",
  "Excellent",
  "Very Good",
  "Very Good",
  "Very Good",
  "Good",
  "Good",
  "Good",
  "Fair",
  "Fair",
  "Poor",
]

/** Builds 90 establishments; the first row matches the spec sample. */
export function buildEstablishments(): Establishment[] {
  const rng = mulberry32(0x51f4_f00d)
  const nextCr = (id: number) => String(140_000 + id).padStart(6, "0").slice(-6)

  const list: Establishment[] = [
    {
      id: 1,
      name: "Bayt El Talleh",
      crNumber: "140232",
      area: "Katara",
      location: "Katara Hills",
      status: "Open",
      activityType: "Restaurant",
    },
  ]

  // Skip index 0 — reserved for the canonical "Bayt El Talleh" sample row.
  let nameIdx = 1
  for (let id = 2; id <= 90; id++) {
    const suffix =
      nameIdx >= ESTABLISHMENT_NAMES.length
        ? ` ${Math.floor(nameIdx / ESTABLISHMENT_NAMES.length) + 1}`
        : ""
    const base = `${ESTABLISHMENT_NAMES[nameIdx % ESTABLISHMENT_NAMES.length]!}${suffix}`
    nameIdx += 1

    const area = pick(rng)(AREAS)
    list.push({
      id,
      name: base,
      crNumber: nextCr(id),
      area,
      location: `${area} — ${pick(rng)(["North", "South", "Central", "Marina", "Plaza", "Park"])}`,
      status: pick(rng)([
        "Open",
        "Open",
        "Open",
        "Under Review",
        "Closed",
      ] as const),
      activityType: pick(rng)(ACTIVITY_TYPES),
    })
  }

  return list
}

function formatRef(year: number, seq: number) {
  const y = String(year).slice(-2)
  const n = String(seq).padStart(5, "0")
  return `FP/${y}/${n}`
}

/** Builds 630 inspections; the first row matches the spec sample. */
export function buildInspections(establishments: Establishment[]): Inspection[] {
  const rng = mulberry32(0x15_7ec7)
  const names = establishments.map((e) => e.name)

  const inspections: Inspection[] = [
    {
      establishmentName: "Bayt El Talleh",
      date: new Date("2024-04-06T12:00:00"),
      rating: "Fair",
      inspector: "Marwen Loulen",
      refNumber: "FP/24/03038",
    },
  ]

  let seq = 30_039
  const start = new Date("2023-01-01T00:00:00").getTime()
  const end = new Date("2025-04-30T00:00:00").getTime()

  for (let i = 1; i < 630; i++) {
    const establishmentName = pick(rng)(names)
    const t = start + Math.floor(rng() * (end - start))
    const date = new Date(t)
    const year = date.getFullYear()
    inspections.push({
      establishmentName,
      date,
      rating: pick(rng)(WEIGHTED_RATINGS),
      inspector: pick(rng)(INSPECTORS),
      refNumber: formatRef(year, seq),
    })
    seq += 1
  }

  return inspections.sort((a, b) => b.date.getTime() - a.date.getTime())
}
