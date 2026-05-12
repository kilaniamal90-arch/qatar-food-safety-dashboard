import type { SessionRole } from "@/auth/session"

export type EstablishmentEditPermissionSubject = {
  area_id?: string | null
}

export type EstablishmentEditUser = {
  role: SessionRole
  /** Assigned Supabase `areas.id` values (supervisor / inspector). */
  areas?: string[] | null
}

const ESTABLISHMENT_CRUD_ROLES: SessionRole[] = ["admin", "supervisor", "inspector"]

/**
 * Area gate for inspection-linked flows: admin all; viewer none; supervisor / inspector only assigned areas.
 */
export function canAccessEstablishmentArea(
  establishment: EstablishmentEditPermissionSubject,
  currentUser: EstablishmentEditUser,
): boolean {
  if (currentUser.role === "admin") return true
  if (currentUser.role === "viewer") return false

  const aid = establishment.area_id
  if (aid == null || String(aid).trim() === "") return false

  const userAreaIds = currentUser.areas ?? []
  return userAreaIds.includes(String(aid))
}

/** Establishment create/update/delete in UI: admin, supervisor, and inspector. */
export function canEditEstablishment(
  _establishment: EstablishmentEditPermissionSubject,
  currentUser: EstablishmentEditUser,
): boolean {
  void _establishment
  return ESTABLISHMENT_CRUD_ROLES.includes(currentUser.role)
}
