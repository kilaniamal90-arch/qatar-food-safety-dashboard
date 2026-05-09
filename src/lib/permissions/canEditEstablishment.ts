import type { SessionRole } from "@/auth/session"

export type EstablishmentEditPermissionSubject = {
  area_id?: string | null
}

export type EstablishmentEditUser = {
  role: SessionRole
  /** Assigned Supabase `areas.id` values (supervisor / inspector). */
  areas?: string[] | null
}

/**
 * Admin: full access. Supervisor / inspector: only establishments in assigned areas.
 * Viewer: no edit access.
 */
export function canEditEstablishment(
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
