import type { Establishment, Inspection } from "@/data/rawData"
import { normalizeNameKey, type EstablishmentStatusHistoryRow } from "@/features/data-import/mergePipeline"
import { estNormKey } from "@/features/data-import/phase2Detection"

export function renameEstablishmentAcrossDrafts(
  fileNameNormKey: string,
  canonicalName: string,
  establishments: Establishment[],
  statusHistory: EstablishmentStatusHistoryRow[],
  inspections: Inspection[],
) {
  for (const e of establishments) {
    if (estNormKey(e.name) === fileNameNormKey) e.name = canonicalName
  }
  for (const h of statusHistory) {
    if (estNormKey(h.establishmentName) === fileNameNormKey) {
      h.establishmentName = canonicalName
    }
  }
  for (const i of inspections) {
    if (estNormKey(i.establishmentName) === fileNameNormKey) {
      i.establishmentName = canonicalName
    }
  }
}

export function replaceInspectorLabelInInspections(
  inspections: Inspection[],
  fileLabelNormKey: string,
  canonicalLabel: string,
) {
  for (const i of inspections) {
    const t = String(i.inspector ?? "").trim()
    if (!t || t === "—" || t === "-") continue
    if (normalizeNameKey(t).toLowerCase() === fileLabelNormKey) {
      i.inspector = canonicalLabel
    }
  }
}

export function linkInspectionsToEstablishmentName(
  inspections: Inspection[],
  /** Any inspection-sheet spelling that should map to `targetName`. */
  fromNameNormKeys: string[],
  targetName: string,
) {
  const keySet = new Set(fromNameNormKeys)
  for (const i of inspections) {
    const nk = estNormKey(i.establishmentName)
    if (keySet.has(nk)) i.establishmentName = targetName
  }
}

export function cloneEstablishmentAsNew(
  template: Establishment,
  newName: string,
  establishments: Establishment[],
): Establishment {
  let maxId = 0
  for (const e of establishments) {
    const n = Number(e.id)
    if (Number.isFinite(n)) maxId = Math.max(maxId, n)
  }
  const id = String(maxId + 1)
  const copy: Establishment = {
    ...template,
    id,
    name: newName,
    crNumber: String(maxId + 1),
  }
  establishments.push(copy)
  return copy
}
