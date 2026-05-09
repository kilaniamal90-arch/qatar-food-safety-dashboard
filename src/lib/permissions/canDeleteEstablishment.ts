import {
  canEditEstablishment,
  type EstablishmentEditPermissionSubject,
  type EstablishmentEditUser,
} from "@/lib/permissions/canEditEstablishment"

/** Same area/role rules as edit: admin all; viewer none; inspector roles only assigned areas. */
export function canDeleteEstablishment(
  establishment: EstablishmentEditPermissionSubject,
  currentUser: EstablishmentEditUser,
): boolean {
  return canEditEstablishment(establishment, currentUser)
}

export type { EstablishmentEditPermissionSubject, EstablishmentEditUser }
