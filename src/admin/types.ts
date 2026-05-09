/** Admin-panel domain types (mock until Supabase). */

export type AdminUserRole = "admin" | "supervisor" | "inspector"

/**
 * Admin-panel and profile roles stored in `public.users.role`.
 * Alias for consumers that use the name `UserRole`.
 */
export type UserRole = AdminUserRole

/** Map legacy DB/JWT values to the current role union. */
export function normalizeAdminUserRole(raw: string): AdminUserRole {
  if (raw === "inspector_manager") return "supervisor"
  if (raw === "admin" || raw === "supervisor" || raw === "inspector") return raw
  return "inspector"
}

export interface ManagedUser {
  /** Primary key in public.users */
  id: string
  /** Supabase Auth user id when linked; null = pending activation */
  authUserId: string | null
  name: string
  email: string
  /** Only used when creating / activating a user in admin */
  password?: string
  role: AdminUserRole
  areaIds: string[]
  canImport: boolean
  isActive: boolean
}

export interface ManagedArea {
  id: string
  nameAr: string
  nameEn: string
}

export interface ManagedRating {
  id: string
  nameAr: string
  nameEn: string
  color: string
  order: number
  /** Days until suggested re-inspection (optional DB column `reinspection_days`). */
  reinspectionDays?: number | null
}

/** Single selectable calendar year in admin (many can be active). */
export interface ManagedYear {
  id: string
  year: number
  isActive: boolean
}

export interface ManagedStatus {
  id: string
  nameAr: string
  nameEn: string
  order: number
}

export interface ManagedPeriod {
  id: string
  ratingId: string
  days: number
}

export interface Inspector {
  id: string
  nameAr: string
  nameEn: string
  /** Convenience label for dense layouts */
  name: string
  isActive: boolean
}

/** Calendar events / notifications (Supabase `events`). */
export interface ManagedEvent {
  id: string
  titleAr: string
  titleEn: string
  descriptionAr: string | null
  descriptionEn: string | null
  /** Free-text location (optional); not tied to `areas` table. */
  areaNameAr: string | null
  areaNameEn: string | null
  eventDate: string
  year: number
  icon: string
  isActive: boolean
}
