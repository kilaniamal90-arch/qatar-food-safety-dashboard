import type { Establishment, OperationalStatus } from "@/data/rawData"

/** Normalized establishment name key aligned with Supabase save (`normKey` / `normalizeNameKey`). */
export type EstNormKey = string

/** Supabase establishments row (+ area labels) loaded for Phase 2. */
export type Phase2DbEstablishment = {
  id: string
  name: string
  crNumber: string
  trimCr: string
  location: string
  phone: string
  email: string
  personInCharge: string
  serviceHours: string
  activityType: string
  notes: string
  taskType: string
  nameInEms: string
  nbOutlets: number | null
  accountStatusInEms: string
  areaLabelPrimary: string
}

export type Phase2DbStatusHistoryRow = {
  establishmentId: string
  calendarYear: number
  operationalStatus: OperationalStatus
}

export type Phase2DbInspector = {
  id: string
  labels: string[]
  /** Canonical display for UI (“best” English → Arabic fallback). */
  displayName: string
}

/** Decisions persisted into save payload + in-memory drafts. */
export type ImportSavePhase2Artifacts = {
  /** Drop `name:{norm}` from resolver so a new establishment row inserts (duplicate norm). */
  omitNameDedupeNormKeys?: EstNormKey[]
  /** PATCH existing establishments with workbook row before inserts. */
  establishmentUpdates?: Array<{ dbEstablishmentId: string; fileEstablishment: Establishment }>
  /** Upsert/update status-history rows conflicting with workbook. */
  statusHistoryUpserts?: Array<{
    dbEstablishmentId: string
    calendarYear: number
    operationalStatus: OperationalStatus
  }>
}

export type Phase2CaseEstablishmentConflict = {
  normKey: EstNormKey
  fileDisplayName: string
  dbDisplayName: string
  dbEstablishmentId: string
}

export type Phase2FieldMismatch = {
  fieldKey:
    | "area"
    | "location"
    | "phone"
    | "email"
    | "personInCharge"
    | "serviceHours"
    | "activityType"
    | "notes"
    | "taskType"
    | "nameInEms"
    | "nbOutlets"
    | "accountStatusEms"
    | "crNumber"
  fileValue: string
  dbValue: string
}

export type Phase2DataEstablishmentConflict = {
  normKey: EstNormKey
  establishmentName: string
  dbEstablishmentId: string
  mismatches: Phase2FieldMismatch[]
}

export type Phase2StatusHistoryConflict = {
  establishmentNameNormKey: EstNormKey
  establishmentName: string
  calendarYear: number
  dbEstablishmentId: string
  dbStatus: OperationalStatus
  fileStatus: OperationalStatus
}

export type Phase2InspectorFuzzyConflict = {
  /** Stable key (normalized inspector label from file). */
  key: string
  /** Original spelling occurrences in workbook. */
  fileLabels: string[]
  /** Excel row numbers for inspection rows using this inspector label. */
  inspectionExcelRows: number[]
  dbInspectorId: string
  canonicalInspectorName: string
}

export type Phase2InspectionEstablishmentConflict = {
  /** Normalized inspections-sheet name keys (distinct spellings clustered to one target). */
  inspectionNameVariantsNormKeys: string[]
  inspectionExcelRows: number[]
  inspectionsSheetDisplayName: string
  suggestedEstablishment: Establishment
}

export type Phase2UnknownInspectorsFatal = {
  items: Array<{ inspectorName: string; rows: number[] }>
}

export type Phase2DetectionResult = {
  /** Blocks import — reuse importBlocked UI. */
  unknownInspectors: Phase2UnknownInspectorsFatal | null
  establishmentCaseConflicts: Phase2CaseEstablishmentConflict[]
  establishmentDataConflicts: Phase2DataEstablishmentConflict[]
  statusHistoryConflicts: Phase2StatusHistoryConflict[]
  inspectorFuzzyConflicts: Phase2InspectorFuzzyConflict[]
  inspectionEstablishmentConflicts: Phase2InspectionEstablishmentConflict[]
}
