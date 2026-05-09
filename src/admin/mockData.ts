import type {
  Inspector,
  ManagedArea,
  ManagedPeriod,
  ManagedRating,
  ManagedStatus,
  ManagedUser,
  ManagedYear,
} from "@/admin/types"

export function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

export async function simulatedSave<T>(
  ms: number,
  action: () => T,
): Promise<T> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
  return action()
}

/** Mock areas aligned with Qatar dashboard names */
export const MOCK_AREAS: ManagedArea[] = [
  { id: "a-doha", nameAr: "الدوحة", nameEn: "Doha" },
  { id: "a-rayyan", nameAr: "الريان", nameEn: "Al Rayyan" },
  { id: "a-wakrah", nameAr: "الوكرة", nameEn: "Al Wakrah" },
  { id: "a-umsal", nameAr: "أم صلال", nameEn: "Umm Salal" },
  { id: "a-khor", nameAr: "الخور", nameEn: "Al Khor" },
  { id: "a-shamal", nameAr: "الشمال", nameEn: "Al Shamal" },
]

export const MOCK_RATINGS: ManagedRating[] = [
  {
    id: "rt-excellent",
    nameAr: "ممتاز",
    nameEn: "Excellent",
    color: "#10B981",
    order: 1,
  },
  {
    id: "rt-vg",
    nameAr: "جيد جداً",
    nameEn: "Very Good",
    color: "#84CC16",
    order: 2,
  },
  {
    id: "rt-good",
    nameAr: "جيد",
    nameEn: "Good",
    color: "#FBBF24",
    order: 3,
  },
  {
    id: "rt-fair",
    nameAr: "متوسط",
    nameEn: "Fair",
    color: "#FB923C",
    order: 4,
  },
  {
    id: "rt-poor",
    nameAr: "ضعيف",
    nameEn: "Poor",
    color: "#EF4444",
    order: 5,
  },
  {
    id: "rt-vp",
    nameAr: "ضعيف جداً",
    nameEn: "Very Poor",
    color: "#B91C1C",
    order: 6,
  },
]

export const MOCK_STATUSES: ManagedStatus[] = [
  {
    id: "st-open",
    nameAr: "مفتوحة",
    nameEn: "Open",
    order: 1,
  },
  {
    id: "st-closed",
    nameAr: "مغلقة",
    nameEn: "Closed",
    order: 2,
  },
  {
    id: "st-temp",
    nameAr: "مغلقة مؤقتاً",
    nameEn: "Temporary Closed",
    order: 3,
  },
  {
    id: "st-soon",
    nameAr: "قريباً",
    nameEn: "Open Soon",
    order: 4,
  },
]

/** Admin-managed years operators can analyse (flattened calendar years). */
export const MOCK_MANAGED_YEARS: ManagedYear[] = (() => {
  const years: ManagedYear[] = []
  for (let y = 2020; y <= 2030; y += 1) {
    years.push({
      id: `y-${y}`,
      year: y,
      isActive: y >= 2024 && y <= 2030,
    })
  }
  return years
})()

/** Default reinspection thresholds (days) keyed to rating IDs */
export const MOCK_PERIODS: ManagedPeriod[] = MOCK_RATINGS.map((r, i) => ({
  id: `pd-${r.id}`,
  ratingId: r.id,
  days: [365, 180, 90, 45, 30, 21][i] ?? 60,
}))

export const MOCK_USERS: ManagedUser[] = [
  {
    id: "u-1",
    authUserId: null,
    name: "Nasser Al-Marri",
    email: "n.almarri@moph.gov.qa",
    role: "admin",
    areaIds: [],
    canImport: true,
    isActive: true,
  },
  {
    id: "u-2",
    authUserId: null,
    name: "Haneen Al-Thani",
    email: "h.althani@moph.gov.qa",
    role: "supervisor",
    areaIds: [],
    canImport: true,
    isActive: true,
  },
  {
    id: "u-3",
    authUserId: null,
    name: "Khalid Osman",
    email: "k.osman@moph.gov.qa",
    role: "inspector",
    areaIds: [],
    canImport: false,
    isActive: false,
  },
]

/** 20 inspectors from supplied Excel-derived list (+ completions) */
function inspRow(nameEn: string, nameAr: string, isActive = true): Omit<Inspector, "id"> {
  const name =
    nameAr.trim() && nameEn.trim() && nameAr !== nameEn
      ? `${nameAr} (${nameEn})`
      : nameEn || nameAr
  return { nameAr, nameEn, name, isActive }
}

export const MOCK_INSPECTORS: Inspector[] = [
  inspRow("Islem Kassar", "إسلام قصار"),
  inspRow("Halima Abbouz", "حليمة عبوز"),
  inspRow("Farah Ayoubi", "فرح أيوبي"),
  inspRow("Yosr Sbaa", "يسر صباع"),
  inspRow("Marwen Loulen", "مروان لولين"),
  inspRow("Amal Kilani", "أمل كلاني"),
  inspRow("Takwa Saoudi", "تقوى سعودي"),
  inspRow("Fatema Al-Thani", "فاطمة آل ثاني"),
  inspRow("Noura Hassan", "نورا حسن"),
  inspRow("Alya Al-Kuwari", "علياء الكواري"),
  inspRow("Huda Al-Marri", "هدى المري"),
  inspRow("Salman Al-Yafei", "سلمان اليافعي"),
  inspRow("Lina Al-Obaidly", "لينا العبيدلي"),
  inspRow("Khaled Ibrahim", "خالد إبراهيم", false),
  inspRow("Mona Al-Shammari", "منى الشمري"),
  inspRow("Rashed Al-Kaabi", "راشد الكعبي"),
  inspRow("Dina Hassan", "دينا حسن"),
  inspRow("Omar Al-Khalifa", "عمر آل خليفة"),
  inspRow("Yasmin Al-Issa", "ياسمين العيسى"),
  inspRow("Abdullah Al-Otaibi", "عبدالله العتيبي"),
].map((x, i) => ({ ...x, id: String(i + 1) }))
