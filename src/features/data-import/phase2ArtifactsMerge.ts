import type { ImportSavePhase2Artifacts } from "@/features/data-import/phase2ImportTypes"

export function emptyPhase2Artifacts(): ImportSavePhase2Artifacts {
  return {
    omitNameDedupeNormKeys: [],
    establishmentUpdates: [],
    statusHistoryUpserts: [],
  }
}

export function mergePhase2Artifacts(
  base: ImportSavePhase2Artifacts,
  delta: ImportSavePhase2Artifacts,
): ImportSavePhase2Artifacts {
  return {
    omitNameDedupeNormKeys: [
      ...new Set([
        ...(base.omitNameDedupeNormKeys ?? []),
        ...(delta.omitNameDedupeNormKeys ?? []),
      ]),
    ],
    establishmentUpdates: [
      ...(base.establishmentUpdates ?? []),
      ...(delta.establishmentUpdates ?? []),
    ],
    statusHistoryUpserts: [
      ...(base.statusHistoryUpserts ?? []),
      ...(delta.statusHistoryUpserts ?? []),
    ],
  }
}

export function phase2ArtifactsNonEmpty(p?: ImportSavePhase2Artifacts | null): boolean {
  if (!p) return false
  return (
    (p.omitNameDedupeNormKeys?.length ?? 0) > 0 ||
    (p.establishmentUpdates?.length ?? 0) > 0 ||
    (p.statusHistoryUpserts?.length ?? 0) > 0
  )
}
