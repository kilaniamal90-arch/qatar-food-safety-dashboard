/**
 * Deterministic mock dataset (90 establishments × 630 inspections).
 * Field names mirror the expected Excel structure from the spec.
 */

function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  const idx = Math.floor(rng() * items.length)
  return items[idx] ?? items[0]!
}

function weightedPick<T>(
  rng: () => number,
  items: readonly { value: T; weight: number }[],
): T {
  const total = items.reduce((s, x) => s + x.weight, 0)
  let r = rng() * total
  for (const item of items) {
    r -= item.weight
    if (r <= 0) return item.value
  }
  return items[items.length - 1]!.value
}

// ─── Public types ────────────────────────────────────────────────────────────

export const AREAS_AR = [
  "الدوحة",
  "الريان",
  "الوكرة",
  "أم صلال",
  "الخور",
  "الشمال",
] as const
export type AreaAr = (typeof AREAS_AR)[number]
/**
 * `"all"` = nationwide (admins).
 * `"my-areas"` = all jurisdictions assigned to the current non-admin user (`user_areas`).
 * Otherwise a label matching Supabase `areas.name_ar` / `name_en` (or legacy mock Arabic names).
 */
export type AreaFilter = "all" | "my-areas" | AreaAr | (string & {})

/** Multi-area / aggregate slice: no extra client-side filter by `establishment.area` string. */
export function isDashboardAreaAggregate(area: AreaFilter): boolean {
  return area === "all" || area === "my-areas"
}

/** Dashboard / events calendar year string (e.g. `"2026"`); should match an active `years.year`. */
export type YearFilter = string

export type OperationalStatus =
  | "Open"
  | "Closed"
  | "Temporary Closed"
  | "Open Soon"

export type InspectionRating =
  | "Excellent"
  | "Very Good"
  | "Good"
  | "Fair"
  | "Poor"
  | "Very Poor"

export type Establishment = {
  id: string
  name: string
  /** From DB `establishments.name_en`; used for English-only Excel export while `name` stays the canonical join/display key. */
  nameEn?: string
  crNumber: string
  area: AreaAr | string
  /** Supabase `areas.id` when available from API rows. */
  areaId?: string
  /** Supabase `operational_statuses.id` when available from API rows. */
  operationalStatusId?: string
  /** Joined `areas.name_en`; used for English-only Excel export while `area` stays the locale-aligned label/filter key. */
  areaNameEn?: string
  location: string
  operationalStatus: OperationalStatus
  activityType: string
  /** Extended columns from Establishments workbook (optional after import). */
  nameInEms?: string
  nbOutlets?: number | null
  accountStatusInEms?: string
  taskType?: string
  phone?: string
  personInCharge?: string
  email?: string
  serviceHours?: string
  establishmentNote?: string
  establishmentPhoto?: string
}

export type Inspection = {
  establishmentName: string
  /** Parsed visit day when available; spreadsheets may omit or send non-parsable values. */
  inspectionDate: Date | null
  rating: InspectionRating
  inspector: string
  /** Official reference when present; null when omitted from source or stored as NULL. */
  refNumber: string | null
  /** Stable index in import parse order; used for dedupe keys when date/reference missing. */
  importRowOrdinal?: number
  /** Optional payload from spreadsheets / imports. */
  note?: string
  /** Inspection task type (e.g. routine visit) — Sheet 3. */
  taskType?: string
}

// ─── Name parts ──────────────────────────────────────────────────────────────

const PREFIXES = [
  "مطعم",
  "كافيه",
  "مطبخ",
  "بيت",
  "حلويات",
] as const

const NAME_WORDS = [
  "الريم",
  "النخيل",
  "الخليج",
  "الفردوس",
  "السلام",
  "البحر",
  "الوفاء",
  "التراث",
  "الصفا",
  "الزيتون",
  "البوابة",
  "الأمير",
  "الواحة",
  "الحدائق",
  "الشرق",
  "القصر",
  "النجوم",
  "الجنوب",
] as const

const ACTIVITY_TYPES = [
  "مطعم",
  "كافيه",
  "فندق",
  "مخبزة",
  "ماكولات سريعة",
  "مطبخ مركزي",
  "خدمات تموين",
] as const

const INSPECTORS = [
  "مروان لولن",
  "فاطمة الكواري",
  "حسن المطوع",
  "نورة السليطي",
  "عائشة المناعي",
  "عمر العمادي",
  "ليلى المهندي",
  "سارة الهاجري",
  "خالد الدوسري",
  "ريم الجابر",
] as const

const STATUS_WEIGHTS: { value: OperationalStatus; weight: number }[] = [
  { value: "Open", weight: 7 },
  { value: "Closed", weight: 2 },
  { value: "Temporary Closed", weight: 0.7 },
  { value: "Open Soon", weight: 0.3 },
]

const RATING_WEIGHTS: { value: InspectionRating; weight: number }[] = [
  { value: "Excellent", weight: 3 },
  { value: "Very Good", weight: 2.7 },
  { value: "Good", weight: 2.2 },
  { value: "Fair", weight: 1.3 },
  { value: "Poor", weight: 0.9 },
  { value: "Very Poor", weight: 0.5 },
]

// ─── Generators ──────────────────────────────────────────────────────────────

function buildEstablishments(): Establishment[] {
  const rng = mulberry32(0xd0_fa_f00d)
  const list: Establishment[] = []

  // 5 prefixes × 18 name-words = 90 unique names, 15 per area
  for (let i = 0; i < 90; i++) {
    const prefixIdx = i % PREFIXES.length
    const wordIdx = Math.floor(i / PREFIXES.length)
    const prefix = PREFIXES[prefixIdx]!
    const word = NAME_WORDS[wordIdx]!
    const areaIdx = Math.floor(i / 15)
    const area = AREAS_AR[areaIdx]!
    const locationSuffix = pick(rng, [
      "المنطقة الصناعية",
      "شارع الكورنيش",
      "المنطقة التجارية",
      "شارع مصطفى",
      "المنطقة السكنية",
    ])

    list.push({
      id: String(i + 1),
      name: `${prefix} ${word}`,
      crNumber: String(140_001 + i),
      area,
      location: `${area} — ${locationSuffix}`,
      operationalStatus: weightedPick(rng, STATUS_WEIGHTS),
      activityType: pick(rng, ACTIVITY_TYPES),
    })
  }

  return list
}

function fmtRef(year: number, seq: number): string {
  return `FP/${String(year).slice(-2)}/${String(seq).padStart(5, "0")}`
}

function buildInspections(establishments: Establishment[]): Inspection[] {
  const rng = mulberry32(0x1a_5b_3c_71)
  const names = establishments.map((e) => e.name)
  const list: Inspection[] = []

  let seq = 10_001

  // Distribute 630 inspections across 2024-2026 (~210 per year)
  const yearRanges: [number, Date, Date][] = [
    [210, new Date("2024-01-01"), new Date("2024-12-31")],
    [210, new Date("2025-01-01"), new Date("2025-12-31")],
    [210, new Date("2026-01-01"), new Date("2026-04-30")],
  ]

  for (const [count, start, end] of yearRanges) {
    const span = end.getTime() - start.getTime()
    for (let i = 0; i < count; i++) {
      const establishmentName = pick(rng, names)
      const t = start.getTime() + Math.floor(rng() * span)
      const date = new Date(t)
      list.push({
        establishmentName,
        inspectionDate: date,
        rating: weightedPick(rng, RATING_WEIGHTS),
        inspector: pick(rng, INSPECTORS),
        refNumber: fmtRef(date.getFullYear(), seq),
      })
      seq += 1
    }
  }

  return list
}

// ─── Singletons ──────────────────────────────────────────────────────────────

export const rawEstablishments = buildEstablishments()
export const rawInspections = buildInspections(rawEstablishments)
