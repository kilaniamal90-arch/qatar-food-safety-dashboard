import {
  canEditEstablishment,
  type EstablishmentEditPermissionSubject,
  type EstablishmentEditUser,
} from "@/lib/permissions/canEditEstablishment"

/** Same role rules as establishment edit: admin, supervisor, inspector. */
export function canDeleteEstablishment(
  establishment: EstablishmentEditPermissionSubject,
  currentUser: EstablishmentEditUser,
): boolean {
  return canEditEstablishment(establishment, currentUser)
}

export type { EstablishmentEditPermissionSubject, EstablishmentEditUser }
