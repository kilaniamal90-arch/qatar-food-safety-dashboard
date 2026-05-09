export type EstablishmentBreakdown = {
  count: number
  percentage: number
}

export type EstablishmentsStats = {
  total: number
  trend: string
  breakdown: {
    open: EstablishmentBreakdown
    closed: EstablishmentBreakdown
    underOpening: EstablishmentBreakdown
  }
}

export type RatingBreakdown = {
  count: number
  percentage: number
}

export type InspectionsStats = {
  total: number
  ratings: {
    excellent: RatingBreakdown
    veryGood: RatingBreakdown
    good: RatingBreakdown
    medium: RatingBreakdown
    weak: RatingBreakdown
    veryWeak: RatingBreakdown
  }
}

export type DashboardData = {
  establishments: EstablishmentsStats
  inspections: InspectionsStats
}

export type AreaKey =
  | "all"
  | "الدوحة"
  | "الريان"
  | "الوكرة"
  | "أم صلال"
  | "الخور"
  | "الشمال"

export const DASHBOARD_AREAS: AreaKey[] = [
  "all",
  "الدوحة",
  "الريان",
  "الوكرة",
  "أم صلال",
  "الخور",
  "الشمال",
]

export const DASHBOARD_YEARS = [2024, 2025, 2026] as const
export type DashboardYear = (typeof DASHBOARD_YEARS)[number]

/** Deterministic mock data keyed by year × area (partial — missing keys fall back to the *_all entry) */
type DataKey = `${DashboardYear}_${AreaKey}`

const DATA_MAP: Partial<Record<DataKey, DashboardData>> = {
  "2026_all": {
    establishments: {
      total: 4820,
      trend: "+6.6%",
      breakdown: {
        open: { count: 4210, percentage: 87.3 },
        closed: { count: 312, percentage: 6.5 },
        underOpening: { count: 298, percentage: 6.2 },
      },
    },
    inspections: {
      total: 12640,
      ratings: {
        excellent: { count: 1820, percentage: 37.8 },
        veryGood: { count: 1240, percentage: 25.7 },
        good: { count: 860, percentage: 17.8 },
        medium: { count: 520, percentage: 10.8 },
        weak: { count: 230, percentage: 4.8 },
        veryWeak: { count: 150, percentage: 3.1 },
      },
    },
  },
  "2026_الدوحة": {
    establishments: {
      total: 1850,
      trend: "+4.2%",
      breakdown: {
        open: { count: 1620, percentage: 87.6 },
        closed: { count: 130, percentage: 7.0 },
        underOpening: { count: 100, percentage: 5.4 },
      },
    },
    inspections: {
      total: 5100,
      ratings: {
        excellent: { count: 720, percentage: 38.5 },
        veryGood: { count: 480, percentage: 25.6 },
        good: { count: 310, percentage: 16.6 },
        medium: { count: 195, percentage: 10.4 },
        weak: { count: 90, percentage: 4.8 },
        veryWeak: { count: 55, percentage: 2.9 },
      },
    },
  },
  "2026_الريان": {
    establishments: {
      total: 980,
      trend: "+8.1%",
      breakdown: {
        open: { count: 860, percentage: 87.8 },
        closed: { count: 65, percentage: 6.6 },
        underOpening: { count: 55, percentage: 5.6 },
      },
    },
    inspections: {
      total: 2600,
      ratings: {
        excellent: { count: 380, percentage: 36.9 },
        veryGood: { count: 260, percentage: 25.2 },
        good: { count: 190, percentage: 18.5 },
        medium: { count: 110, percentage: 10.7 },
        weak: { count: 50, percentage: 4.9 },
        veryWeak: { count: 30, percentage: 2.9 },
      },
    },
  },
  "2026_الوكرة": {
    establishments: {
      total: 620,
      trend: "+5.0%",
      breakdown: {
        open: { count: 540, percentage: 87.1 },
        closed: { count: 42, percentage: 6.8 },
        underOpening: { count: 38, percentage: 6.1 },
      },
    },
    inspections: {
      total: 1600,
      ratings: {
        excellent: { count: 230, percentage: 37.2 },
        veryGood: { count: 165, percentage: 26.7 },
        good: { count: 110, percentage: 17.8 },
        medium: { count: 65, percentage: 10.5 },
        weak: { count: 30, percentage: 4.9 },
        veryWeak: { count: 20, percentage: 3.2 },
      },
    },
  },
  "2026_أم صلال": {
    establishments: {
      total: 420,
      trend: "+7.7%",
      breakdown: {
        open: { count: 365, percentage: 86.9 },
        closed: { count: 30, percentage: 7.1 },
        underOpening: { count: 25, percentage: 6.0 },
      },
    },
    inspections: {
      total: 1050,
      ratings: {
        excellent: { count: 145, percentage: 38.0 },
        veryGood: { count: 108, percentage: 28.3 },
        good: { count: 71, percentage: 18.6 },
        medium: { count: 38, percentage: 9.9 },
        weak: { count: 15, percentage: 3.9 },
        veryWeak: { count: 8, percentage: 2.1 },
      },
    },
  },
  "2026_الخور": {
    establishments: {
      total: 510,
      trend: "+9.4%",
      breakdown: {
        open: { count: 445, percentage: 87.3 },
        closed: { count: 35, percentage: 6.9 },
        underOpening: { count: 30, percentage: 5.9 },
      },
    },
    inspections: {
      total: 1380,
      ratings: {
        excellent: { count: 195, percentage: 37.6 },
        veryGood: { count: 148, percentage: 28.5 },
        good: { count: 95, percentage: 18.3 },
        medium: { count: 55, percentage: 10.6 },
        weak: { count: 22, percentage: 4.2 },
        veryWeak: { count: 8, percentage: 1.5 },
      },
    },
  },
  "2026_الشمال": {
    establishments: {
      total: 440,
      trend: "+3.8%",
      breakdown: {
        open: { count: 380, percentage: 86.4 },
        closed: { count: 32, percentage: 7.3 },
        underOpening: { count: 28, percentage: 6.4 },
      },
    },
    inspections: {
      total: 910,
      ratings: {
        excellent: { count: 150, percentage: 39.5 },
        veryGood: { count: 120, percentage: 31.6 },
        good: { count: 84, percentage: 22.1 },
        medium: { count: 36, percentage: 9.5 },
        weak: { count: 14, percentage: 3.7 },
        veryWeak: { count: 5, percentage: 1.3 },
      },
    },
  },
  "2025_all": {
    establishments: {
      total: 4520,
      trend: "+4.8%",
      breakdown: {
        open: { count: 3950, percentage: 87.4 },
        closed: { count: 295, percentage: 6.5 },
        underOpening: { count: 275, percentage: 6.1 },
      },
    },
    inspections: {
      total: 11820,
      ratings: {
        excellent: { count: 1680, percentage: 36.9 },
        veryGood: { count: 1150, percentage: 25.3 },
        good: { count: 810, percentage: 17.8 },
        medium: { count: 490, percentage: 10.8 },
        weak: { count: 220, percentage: 4.8 },
        veryWeak: { count: 145, percentage: 3.2 },
      },
    },
  },
  "2024_all": {
    establishments: {
      total: 4310,
      trend: "+3.1%",
      breakdown: {
        open: { count: 3765, percentage: 87.4 },
        closed: { count: 278, percentage: 6.5 },
        underOpening: { count: 267, percentage: 6.2 },
      },
    },
    inspections: {
      total: 11230,
      ratings: {
        excellent: { count: 1590, percentage: 35.6 },
        veryGood: { count: 1095, percentage: 24.5 },
        good: { count: 798, percentage: 17.9 },
        medium: { count: 462, percentage: 10.3 },
        weak: { count: 215, percentage: 4.8 },
        veryWeak: { count: 145, percentage: 3.2 },
      },
    },
  },
}

/** Fallback empty data when a key is missing */
const EMPTY_DATA: DashboardData = {
  establishments: {
    total: 0,
    trend: "—",
    breakdown: {
      open: { count: 0, percentage: 0 },
      closed: { count: 0, percentage: 0 },
      underOpening: { count: 0, percentage: 0 },
    },
  },
  inspections: {
    total: 0,
    ratings: {
      excellent: { count: 0, percentage: 0 },
      veryGood: { count: 0, percentage: 0 },
      good: { count: 0, percentage: 0 },
      medium: { count: 0, percentage: 0 },
      weak: { count: 0, percentage: 0 },
      veryWeak: { count: 0, percentage: 0 },
    },
  },
}

export function getDashboardData(year: DashboardYear, area: AreaKey): DashboardData {
  const key: DataKey = `${year}_${area}`
  return DATA_MAP[key] ?? DATA_MAP[`${year}_all`] ?? EMPTY_DATA
}

/** Format a number with English digit grouping */
export function fmtNum(n: number): string {
  return n.toLocaleString("en-US")
}
