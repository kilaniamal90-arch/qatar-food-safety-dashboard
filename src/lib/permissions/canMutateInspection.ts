import type { Establishment } from "@/data/rawData"

import {
  canAccessEstablishmentArea,
  type EstablishmentEditUser,
} from "@/lib/permissions/canEditEstablishment"

function resolvedEstablishmentAreaId(
  establishment: Establishment,
  areaIdFromNames?: string | null,
): string | null {
  const fromEst = establishment.areaId?.trim()
  if (fromEst) return fromEst
  const fromNames = areaIdFromNames?.trim()
  return fromNames || null
}

/** Area-based rules: admin all; viewer none; inspector roles only assigned `areas`. */
export function canEditInspection(
  _inspection: unknown,
  establishment: Establishment,
  currentUser: EstablishmentEditUser,
  areaIdFromNames?: string | null,
): boolean {
  return canAccessEstablishmentArea(
    { area_id: resolvedEstablishmentAreaId(establishment, areaIdFromNames) },
    currentUser,
  )
}

export function canDeleteInspection(
  inspection: unknown,
  establishment: Establishment,
  currentUser: EstablishmentEditUser,
  areaIdFromNames?: string | null,
): boolean {
  return canEditInspection(inspection, establishment, currentUser, areaIdFromNames)
}
