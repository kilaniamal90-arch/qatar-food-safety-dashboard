import type { Establishment, Inspection } from "@/data/rawData"
import { rawEstablishments, rawInspections } from "@/data/rawData"

import { bumpDatasetVersion } from "@/data/datasetVersion"

const STORAGE_KEY = "qfsd-import-dataset-v1"

type StoredInspectionRow = Omit<Inspection, "inspectionDate"> & {
  inspectionDateIso: string | null
}

type StoredEnvelope = {
  v: 1
  establishments: Establishment[]
  inspections: StoredInspectionRow[]
}

function reviveInspection(row: StoredInspectionRow): Inspection {
  const { inspectionDateIso, ...rest } = row
  return {
    ...rest,
    inspectionDate:
      inspectionDateIso &&
      inspectionDateIso !== "" &&
      !Number.isNaN(Date.parse(inspectionDateIso))
        ? new Date(inspectionDateIso)
        : null,
  }
}

/** JSON parsed from disk / localStorage. */
export function readStoredDatasetEnvelope(): StoredEnvelope | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as StoredEnvelope
    if (
      !p ||
      p.v !== 1 ||
      !Array.isArray(p.establishments) ||
      !Array.isArray(p.inspections)
    ) {
      return null
    }
    return p
  } catch {
    return null
  }
}

export function getActiveEstablishments(): Establishment[] {
  const s = readStoredDatasetEnvelope()
  return s ? s.establishments : rawEstablishments
}

export function getActiveInspections(): Inspection[] {
  const s = readStoredDatasetEnvelope()
  return s ? s.inspections.map(reviveInspection) : rawInspections
}

export function persistImportedDataset(
  establishments: Establishment[],
  inspections: Inspection[],
) {
  if (typeof window === "undefined") return
  const payload: StoredEnvelope = {
    v: 1,
    establishments,
    inspections: inspections.map((i) => ({
      establishmentName: i.establishmentName,
      inspectionDateIso:
        i.inspectionDate != null && !Number.isNaN(i.inspectionDate.getTime())
          ? i.inspectionDate.toISOString()
          : null,
      rating: i.rating,
      inspector: i.inspector,
      refNumber: i.refNumber,
      ...(i.note != null ? { note: i.note } : {}),
    })),
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  bumpDatasetVersion()
}
