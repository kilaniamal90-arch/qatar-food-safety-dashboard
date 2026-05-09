import {
  ArrowLeftIcon,
  ArrowRightIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileSpreadsheetIcon,
  Loader2Icon,
  MinusCircleIcon,
  RefreshCwIcon,
  SaveIcon,
  UploadCloudIcon,
  XCircleIcon,
} from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useDropzone } from "react-dropzone"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import {
  IGNORE_VALUE,
  autoMapColumns,
  type ColumnMapping,
} from "@/features/data-import/columnMap"
import { downloadImportTemplate, readExcelTables } from "@/features/data-import/excelIO"
import {
  runImportSheetBlockingValidations,
  type ImportBlockError,
} from "@/features/data-import/importSheetValidation"
import {
  detectDuplicateInspectionsWithinFile,
  dedupeStatusHistoryByEstablishmentAndYearPreserveOrder,
  mergeEstablishments,
  mergeInspectionImport,
  dedupeInspectionsByEstablishmentAndDayPreserveOrder,
  applyStatusHistoryToEstablishments,
  rowsToEstablishments,
  rowsToInspections,
  rowsToStatusHistory,
  formatInspectionValidationRowList,
  type DuplicateAction,
  type DuplicateInspection,
  type EstablishmentStatusHistoryRow,
} from "@/features/data-import/mergePipeline"
import { runPhase1StrictImportValidations } from "@/features/data-import/phase1StrictImportGate"
import {
  ImportPhase2Panel,
  type Phase2Gate,
  type Phase2ResolvePayload,
} from "@/features/data-import/ImportPhase2Panel"
import { loadPhase2SnapshotAndDetect } from "@/features/data-import/phase2Detection"
import {
  emptyPhase2Artifacts,
  phase2ArtifactsNonEmpty,
} from "@/features/data-import/phase2ArtifactsMerge"
import type {
  Phase2DetectionResult,
  ImportSavePhase2Artifacts,
} from "@/features/data-import/phase2ImportTypes"
import { formatInspectionDateDdMmYyyy } from "@/data/establishmentsTable"
import type { Establishment, Inspection } from "@/data/rawData"
import {
  assertNavigatorOnlineForImportSave,
  isImportSaveAbortError,
  toImportSaveAbortError,
  type ImportSaveFailureKind,
} from "@/lib/supabase/importSaveAbort"
import {
  saveImportedDatasetToSupabase,
  type ImportSaveProgressSnapshot,
} from "@/lib/supabase/saveImportedDataset"
import { supabase } from "@/lib/supabase"

type PreviewSaveFailState = {
  kind: ImportSaveFailureKind
  detail: string
}

function importSavePhaseRowIcon(
  snap: ImportSaveProgressSnapshot,
  which: keyof Pick<
    ImportSaveProgressSnapshot,
    "establishments" | "statusHistory" | "inspections"
  >,
) {
  const { total, done } = snap[which]
  if (total == null) return "pause"
  if (total <= 0) return "done"
  if (done >= total) return "done"
  if (snap.phase === which) return "busy"
  if (
    snap.phase === "inspections" &&
    (which === "establishments" || which === "statusHistory")
  )
    return "done"
  if (snap.phase === "statusHistory" && which === "inspections") return "pause"
  if (
    snap.phase === "loading" &&
    (which === "statusHistory" || which === "inspections")
  )
    return "pause"
  if (snap.phase === "loading" && which === "establishments") return "busy"
  if (snap.phase === "establishments" && which !== "establishments") return "pause"
  return "busy"
}

function debugImportPhase(label: string, payload: Record<string, unknown>) {
  if (!import.meta.env.DEV) return
  console.log(`[DataImport] ${label}`, payload)
}

type Step =
  | "upload"
  | "mapping"
  | "phase2Conflicts"
  | "duplicates"
  | "preview"
  | "importBlocked"

type ProcessedPreview = {
  establishments: Establishment[]
  inspections: Inspection[]
  statusHistory: EstablishmentStatusHistoryRow[]
  duplicatesResolved: number
  phase2Artifacts?: ImportSavePhase2Artifacts | null
}

function buildPhase2Gates(det: Phase2DetectionResult): Phase2Gate[] {
  const g: Phase2Gate[] = []
  if (det.establishmentCaseConflicts.length > 0) g.push("establishmentCase")
  if (det.establishmentDataConflicts.length > 0) g.push("establishmentData")
  if (det.statusHistoryConflicts.length > 0) g.push("statusHistory")
  if (det.inspectorFuzzyConflicts.length > 0) g.push("inspectorFuzzy")
  if (det.inspectionEstablishmentConflicts.length > 0) g.push("inspectionEstablishment")
  return g
}

const EST_FIELD_META: {
  id: string
  required?: boolean
}[] = [
  { id: "establishmentName", required: true },
  { id: "nameInEms" },
  { id: "crNumber" },
  { id: "accountStatusEms" },
  { id: "area", required: true },
  { id: "location" },
  { id: "activityType" },
  { id: "phone" },
  { id: "personInCharge" },
  { id: "email" },
  { id: "serviceHours" },
  { id: "establishmentNote" },
  { id: "establishmentPhoto" },
  { id: "nbOutlets" },
]

const STATUS_FIELD_META: {
  id: string
  required?: boolean
}[] = [
  { id: "establishmentName", required: true },
  { id: "year", required: true },
  { id: "operationalStatus", required: true },
]

const INSP_FIELD_META: {
  id: string
  required?: boolean
}[] = [
  { id: "establishmentName", required: true },
  { id: "inspectionDate", required: true },
  { id: "rating", required: true },
  { id: "inspector" },
  { id: "referenceNumber" },
  { id: "taskType" },
  { id: "notes" },
]

function mappingValid(
  map: ColumnMapping[],
  meta: readonly { id: string; required?: boolean }[],
) {
  const chosen = map.map((m) => m.systemField).filter(Boolean) as string[]
  for (const f of meta) {
    if (f.required && !chosen.includes(f.id)) return false
  }
  return true
}

function countsUsedFields(map: ColumnMapping[]) {
  const c = new Map<string, number>()
  for (const m of map) {
    if (!m.systemField) continue
    const k = m.systemField
    c.set(k, (c.get(k) ?? 0) + 1)
  }
  return c
}

type ImportSaveSummary = {
  newEst: number
  newInsp: number
  newStatus: number
  skipEst: number
  skipInsp: number
  unknownDate: number
  fallbackInspectorNames: string[]
  fuzzyInsp: number
  withoutReference: number
  otherWarnings: number
}

function ImportSaveSummaryToast({
  summary,
  t,
  rtl,
}: {
  summary: ImportSaveSummary
  t: (key: string, options?: Record<string, unknown>) => string
  rtl: boolean
}) {
  const hasNotes =
    summary.unknownDate > 0 ||
    summary.fallbackInspectorNames.length > 0 ||
    summary.fuzzyInsp > 0 ||
    summary.withoutReference > 0 ||
    summary.otherWarnings > 0
  const showSkipped = summary.skipEst > 0 || summary.skipInsp > 0

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      className={cn(
        "pointer-events-auto w-[min(100vw-2rem,26rem)] rounded-xl border border-border bg-card p-4 shadow-lg",
        rtl ? "text-end" : "text-start",
      )}
    >
      <div className="rounded-lg border border-emerald-600/35 bg-emerald-50 px-3 py-3 dark:border-emerald-700/50 dark:bg-emerald-950/35">
        <p className="font-semibold text-emerald-950 dark:text-emerald-100">
          {t("dataImport.saveToastTitle")}
        </p>
        <ul className="mt-2 list-none space-y-1 text-sm text-emerald-950/95 dark:text-emerald-100/95">
          <li>{t("dataImport.saveToastNewEstablishments", { count: summary.newEst })}</li>
          <li>{t("dataImport.saveToastNewInspections", { count: summary.newInsp })}</li>
          {summary.newStatus > 0 ? (
            <li>{t("dataImport.saveToastNewStatusHistory", { count: summary.newStatus })}</li>
          ) : null}
          {showSkipped ? (
            <li>
              {t("dataImport.saveToastSkippedLine", {
                skipEst: summary.skipEst,
                skipInsp: summary.skipInsp,
              })}
            </li>
          ) : null}
        </ul>
      </div>

      {hasNotes ? (
        <details className="mt-3 rounded-lg border border-amber-500/40 bg-amber-50/60 dark:border-amber-600/40 dark:bg-amber-950/30">
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-amber-950 dark:text-amber-100">
            {t("dataImport.saveToastNotesToggle")}
          </summary>
          <div className="border-t border-amber-500/25 px-3 py-2 dark:border-amber-700/35">
            <p className="mb-2 text-sm font-semibold text-amber-950 dark:text-amber-100">
              {t("dataImport.saveToastNotesHeading")}
            </p>
            <ul className="list-none space-y-1.5 text-sm text-amber-950/90 dark:text-amber-50/90">
              {summary.unknownDate > 0 ? (
                <li>{t("dataImport.saveToastUnknownDates", { count: summary.unknownDate })}</li>
              ) : null}
              {summary.withoutReference > 0 ? (
                <li>
                  {t("dataImport.inspectionsWithoutReference", {
                    count: summary.withoutReference,
                  })}
                </li>
              ) : null}
              {summary.fallbackInspectorNames.length > 0 ? (
                <li className="space-y-2">
                  <p className="font-medium leading-snug">
                    {t("dataImport.saveToastFallbackInspectorsIntro")}
                  </p>
                  <ul
                    className={cn(
                      "list-inside list-disc space-y-0.5",
                      rtl ? "pe-1" : "ps-1",
                    )}
                  >
                    {summary.fallbackInspectorNames.map((name, i) => (
                      <li key={`${i}-${name}`} className="break-words">
                        {name}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs leading-snug text-amber-950/85 dark:text-amber-50/85">
                    {t("dataImport.saveToastFallbackInspectorsHint")}
                  </p>
                </li>
              ) : null}
              {summary.fuzzyInsp > 0 ? (
                <li>{t("dataImport.saveToastFuzzyInspectors", { count: summary.fuzzyInsp })}</li>
              ) : null}
              {summary.otherWarnings > 0 ? (
                <li>{t("dataImport.saveToastOtherWarnings", { count: summary.otherWarnings })}</li>
              ) : null}
            </ul>
          </div>
        </details>
      ) : null}
    </div>
  )
}

function MappingSection({
  title,
  description,
  mapping,
  meta,
  onChange,
  rtl,
}: {
  title: string
  description?: string
  mapping: ColumnMapping[]
  meta: readonly { id: string; required?: boolean }[]
  onChange: (next: ColumnMapping[]) => void
  rtl: boolean
}) {
  const { t } = useTranslation()

  const opts = meta.map((m) => ({
    value: m.id,
    label: t(`dataImport.fields.${m.id}` as "dataImport.fields.establishmentName"),
    required: Boolean(m.required),
  }))

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className={cn("bg-muted/50", rtl && "[text-align:end]")}>
            <tr>
              <th className="rounded-s-lg px-3 py-2 font-semibold">
                {t("dataImport.fileColumn")}
              </th>
              <th className="px-3 py-2 font-semibold">{t("dataImport.mapsTo")}</th>
              <th className="w-[52px] rounded-e-lg px-2 py-2 text-center font-semibold">
                {t("dataImport.status")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mapping.map((row, index) => {
              function setField(sf: string | null) {
                const copy = [...mapping]
                copy[index] = {
                  ...(mapping[index] as ColumnMapping),
                  systemField: sf === IGNORE_VALUE ? null : sf,
                }
                onChange(copy)
              }
              const current =
                mapping[index]?.systemField === null ||
                mapping[index]?.systemField === undefined
                  ? IGNORE_VALUE
                  : (mapping[index]!.systemField as string)

              return (
                <tr key={`${row.fileColumn}-${index}`} className="hover:bg-muted/30">
                  <td className="px-3 py-3 font-medium">{row.fileColumn}</td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`${title} → ${row.fileColumn}`}
                      value={current}
                      onChange={(e) =>
                        setField(e.target.value === IGNORE_VALUE ? null : e.target.value)
                      }
                      className={cn(
                        "h-10 w-full max-w-xl rounded-lg border border-border bg-card px-3 text-sm shadow-sm",
                        rtl && "text-end",
                      )}
                    >
                      <option value={IGNORE_VALUE}>
                        {t("dataImport.ignoreColumn")}
                      </option>
                      {opts.map((opt) => {
                        const usedElsewhere =
                          mapping.filter(
                            (_, j) =>
                              j !== index && mapping[j]?.systemField === opt.value,
                          ).length > 0
                        return (
                          <option key={opt.value} value={opt.value} disabled={usedElsewhere}>
                            {opt.label}
                            {opt.required ? " *" : ""}
                            {usedElsewhere ? ` (${t("dataImport.alreadyMapped")})` : ""}
                          </option>
                        )
                      })}
                    </select>
                  </td>
                  <td className="text-center align-middle">
                    {row.systemField ? (
                      <CheckCircle2Icon
                        aria-hidden
                        className="mx-auto inline size-5 text-emerald-500"
                      />
                    ) : (
                      <MinusCircleIcon
                        aria-hidden
                        className="mx-auto inline size-5 text-muted-foreground/60"
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

export function DataImportPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const rtl = i18n.language.startsWith("ar")

  const [step, setStep] = useState<Step>("upload")
  const [importBlockError, setImportBlockError] = useState<ImportBlockError | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [parsed, setParsed] = useState<Awaited<ReturnType<typeof readExcelTables>> | null>(
    null,
  )
  const [estMap, setEstMap] = useState<ColumnMapping[]>([])
  const [statusMap, setStatusMap] = useState<ColumnMapping[]>([])
  const [inspMap, setInspMap] = useState<ColumnMapping[]>([])
  const [duplicates, setDuplicates] = useState<DuplicateInspection[]>([])
  const [incomingInspectionsDraft, setIncomingInspectionsDraft] = useState<Inspection[]>(
    [],
  )
  const [incomingStatusHistoryDraft, setIncomingStatusHistoryDraft] = useState<
    EstablishmentStatusHistoryRow[]
  >([])
  const [incomingEstablishmentsDraft, setIncomingEstablishmentsDraft] =
    useState<Establishment[]>([])
  const [dupDecisionMap, setDupDecisionMap] = useState<Map<number, DuplicateAction>>(
    () => new Map(),
  )
  const [dupDialogOpen, setDupDialogOpen] = useState(false)
  const [dupCursor, setDupCursor] = useState(0)
  const [currentAction, setCurrentAction] = useState<DuplicateAction>("update")
  const [applyToAllDuplicates, setApplyToAllDuplicates] = useState(false)
  const [mappingGateBusy, setMappingGateBusy] = useState(false)
  const [phase2Busy, setPhase2Busy] = useState(false)
  const [processed, setProcessed] = useState<ProcessedPreview | null>(null)
  const [saveProgress, setSaveProgress] = useState<ImportSaveProgressSnapshot | null>(null)
  const [saveFailState, setSaveFailState] = useState<PreviewSaveFailState | null>(null)
  const [saveFailureCount, setSaveFailureCount] = useState(0)

  const [phase2Detection, setPhase2Detection] = useState<Phase2DetectionResult | null>(null)
  const [phase2Gates, setPhase2Gates] = useState<Phase2Gate[]>([])
  const [phase2GateIdx, setPhase2GateIdx] = useState(0)
  const [phase2Artifacts, setPhase2Artifacts] = useState<ImportSavePhase2Artifacts>(() =>
    emptyPhase2Artifacts(),
  )

  const wizardProgress =
    step === "upload"
      ? 10
      : step === "mapping"
        ? 35
        : step === "importBlocked"
          ? 35
        : step === "phase2Conflicts"
          ? 52
        : step === "duplicates"
          ? 72
          : 100

  const onDropFile = useCallback(async (file: File) => {
    setBusy(true)
    try {
      const data = await readExcelTables(file)
      setParsed(data)
      const em = autoMapColumns(data.establishmentColumns, "establishments")
      const sm = autoMapColumns(data.statusHistoryColumns, "statusHistory")
      const im = autoMapColumns(data.inspectionsColumns, "inspections")
      setEstMap(em)
      setStatusMap(sm)
      setInspMap(im)
      setDupDecisionMap(new Map())
      setDuplicates([])
      setIncomingEstablishmentsDraft([])
      setIncomingInspectionsDraft([])
      setIncomingStatusHistoryDraft([])
      setProcessed(null)
      setImportBlockError(null)
      setPhase2Detection(null)
      setPhase2Gates([])
      setPhase2GateIdx(0)
      setPhase2Artifacts(emptyPhase2Artifacts())
      setDupDialogOpen(false)
      setDupCursor(0)
      setSaveProgress(null)
      setSaveFailState(null)
      setSaveFailureCount(0)
      setStep("mapping")
      toast.success(t("dataImport.loaded"))
      debugImportPhase("after file read", {
        rawEstablishments: data.establishmentsRows.length,
        rawStatusHistory: data.statusHistoryRows.length,
        rawInspections: data.inspectionsRows.length,
        sampleEstablishment: data.establishmentsRows[0] ?? null,
        sampleInspection: data.inspectionsRows[0] ?? null,
      })
    } catch (e: unknown) {
      console.error(e)
      toast.error(t("dataImport.readFailed"))
    } finally {
      setBusy(false)
    }
  }, [t])

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxSize: 10485760,
    multiple: false,
    disabled: busy,
    onDrop: async (accepted: File[]) => {
      const f = accepted[0]
      if (f) await onDropFile(f)
    },
  })

  const saveToSupabase = useCallback(async () => {
    if (!processed) return
    setSaveFailState(null)
    try {
      assertNavigatorOnlineForImportSave()
    } catch (e: unknown) {
      const err = toImportSaveAbortError(e)
      setSaveFailState({ kind: err.kind, detail: err.message })
      setSaveFailureCount((c) => c + 1)
      return
    }

    setSaveProgress({
      phase: "loading",
      establishments: { done: 0, total: null },
      statusHistory: { done: 0, total: null },
      inspections: { done: 0, total: null },
    })
    setSaveBusy(true)
    try {
      const result = await saveImportedDatasetToSupabase(supabase, {
        establishments: processed.establishments,
        inspections: processed.inspections,
        statusHistory: processed.statusHistory,
        phase2:
          processed.phase2Artifacts && phase2ArtifactsNonEmpty(processed.phase2Artifacts)
            ? processed.phase2Artifacts
            : null,
        onProgress: (snap) => setSaveProgress({ ...snap }),
      })

      if (!result.ok) {
        const detail = result.errors[0] ?? "unknown"
        setSaveFailState({ kind: "supabase", detail })
        setSaveFailureCount((c) => c + 1)
        return
      }

      setSaveFailureCount(0)
      const summary: ImportSaveSummary = {
        newEst: result.establishmentsInserted,
        newInsp: result.inspectionsInserted,
        newStatus: result.statusHistoryInserted,
        skipEst: result.establishmentsSkippedExisting,
        skipInsp: result.inspectionsSkippedExisting,
        unknownDate: result.inspectionsUnknownDateCount,
        withoutReference: result.inspectionsWithoutReferenceCount,
        fallbackInspectorNames: result.inspectorFallbackNames,
        fuzzyInsp: result.inspectorFuzzyMatchCount,
        otherWarnings: result.warnings.length,
      }

      toast.custom(() => <ImportSaveSummaryToast summary={summary} t={t} rtl={rtl} />, {
        duration: 16000,
        position: "top-center",
      })

      if (import.meta.env.DEV && result.warnings.length > 0) {
        console.warn("[DataImport] save warnings", result.warnings)
      }

      navigate("/dashboard")
    } catch (e: unknown) {
      const err = isImportSaveAbortError(e) ? e : toImportSaveAbortError(e)
      setSaveFailState({ kind: err.kind, detail: err.message })
      setSaveFailureCount((c) => c + 1)
    } finally {
      setSaveBusy(false)
      setSaveProgress(null)
    }
  }, [processed, supabase, t, navigate, rtl])

  const estMissing = useMemo(
    () =>
      EST_FIELD_META.filter((f) => f.required && !countsUsedFields(estMap).has(f.id)),
    [estMap],
  )
  const inspMissing = useMemo(
    () =>
      INSP_FIELD_META.filter((f) => f.required && !countsUsedFields(inspMap).has(f.id)),
    [inspMap],
  )

  const statusMissing = useMemo(
    () =>
      STATUS_FIELD_META.filter((f) => f.required && !countsUsedFields(statusMap).has(f.id)),
    [statusMap],
  )

  const duplicateFieldCollisions =
    [...countsUsedFields(estMap).values()].some((v) => v > 1) ||
    [...countsUsedFields(statusMap).values()].some((v) => v > 1) ||
    [...countsUsedFields(inspMap).values()].some((v) => v > 1)

  async function goMappingContinue() {
    if (!parsed) return
    if (
      estMissing.length ||
      inspMissing.length ||
      statusMissing.length ||
      duplicateFieldCollisions ||
      !mappingValid(estMap, EST_FIELD_META) ||
      !mappingValid(statusMap, STATUS_FIELD_META) ||
      !mappingValid(inspMap, INSP_FIELD_META)
    )
      return

    const estRows = parsed.establishmentsRows
    const statusRowsRaw = parsed.statusHistoryRows
    const inspRows = parsed.inspectionsRows

    const block = runImportSheetBlockingValidations({
      establishmentRows: estRows,
      establishmentMapping: estMap,
      statusHistoryRows: statusRowsRaw,
      statusHistoryMapping: statusMap,
      inspectionsRows: inspRows,
      inspectionsMapping: inspMap,
    })
    if (block) {
      setImportBlockError(block)
      setStep("importBlocked")
      return
    }
    setImportBlockError(null)

    setMappingGateBusy(true)
    try {
      const phase1 = await runPhase1StrictImportValidations({
        supabase,
        establishmentRows: estRows,
        establishmentMapping: estMap,
        statusHistoryRows: statusRowsRaw,
        statusHistoryMapping: statusMap,
        inspectionsRows: inspRows,
        inspectionsMapping: inspMap,
      })
      if (phase1) {
        setImportBlockError(phase1)
        setStep("importBlocked")
        return
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(t("dataImport.supabaseFailedDetail", { detail: msg }))
      return
    } finally {
      setMappingGateBusy(false)
    }

    const nextEst = rowsToEstablishments(estRows, estMap)
    let statusHistParsed = rowsToStatusHistory(statusRowsRaw, statusMap)
    const { deduped: statusHistDeduped, removedCount: statusDupRemoved } =
      dedupeStatusHistoryByEstablishmentAndYearPreserveOrder(statusHistParsed)
    statusHistParsed = statusHistDeduped
    if (statusDupRemoved > 0) {
      toast(
        t("dataImport.statusHistoryDupesMerged", { count: statusDupRemoved }),
        { duration: 6500, icon: "ℹ️" },
      )
    }

    applyStatusHistoryToEstablishments(nextEst, statusHistParsed)

    const { inspections: nextInsp, skippedUnparseableDates } = rowsToInspections(
      inspRows,
      inspMap,
    )
    if (skippedUnparseableDates > 0 && import.meta.env.DEV) {
      console.warn(
        "[DataImport] unexpected skippedUnparseableDates after strict validation",
        skippedUnparseableDates,
      )
    }

    if (nextEst.length === 0 && estRows.some((r) => Object.keys(r).length > 0)) {
      toast.error(t("dataImport.noValidEstablishments"))
      return
    }

    setIncomingEstablishmentsDraft(nextEst)
    setIncomingInspectionsDraft(nextInsp)
    setIncomingStatusHistoryDraft(statusHistParsed)

    debugImportPhase("after column mapping", {
      mappedEstablishments: nextEst.length,
      mappedStatusHistory: statusHistParsed.length,
      mappedInspections: nextInsp.length,
    })

    setPhase2Busy(true)
    try {
      const detection = await loadPhase2SnapshotAndDetect({
        supabase,
        fileEstablishments: nextEst,
        fileStatusHistory: statusHistParsed,
        inspections: nextInsp,
      })
      if (detection.unknownInspectors) {
        setImportBlockError({
          kind: "phase2UnknownInspectors",
          items: detection.unknownInspectors.items,
        })
        setStep("importBlocked")
        return
      }
      const gates = buildPhase2Gates(detection)
      if (gates.length > 0) {
        setPhase2Detection(detection)
        setPhase2Gates(gates)
        setPhase2GateIdx(0)
        setPhase2Artifacts(emptyPhase2Artifacts())
        setStep("phase2Conflicts")
        return
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(t("dataImport.supabaseFailedDetail", { detail: msg }))
      return
    } finally {
      setPhase2Busy(false)
    }

    setPhase2Artifacts(emptyPhase2Artifacts())
    continueAfterPhase2EstablishmentWork(nextEst, nextInsp, statusHistParsed)
  }

  function continueAfterPhase2EstablishmentWork(
    nextEst: Establishment[],
    nextInsp: Inspection[],
    statusHistParsed: EstablishmentStatusHistoryRow[],
    phase2Merged?: ImportSavePhase2Artifacts,
  ) {
    const dup = detectDuplicateInspectionsWithinFile(nextInsp)
    setDuplicates(dup)
    setDupDecisionMap(new Map())
    if (dup.length > 0) {
      setDupCursor(0)
      setCurrentAction("update")
      setApplyToAllDuplicates(false)
      setDupDialogOpen(true)
      setStep("duplicates")
      return
    }

    finalizePreview(nextEst, nextInsp, statusHistParsed, new Map(), [], phase2Merged)
  }

  function finalizePreviewAfterLastPhase2Gate(phase2Merged: ImportSavePhase2Artifacts) {
    continueAfterPhase2EstablishmentWork(
      incomingEstablishmentsDraft,
      incomingInspectionsDraft,
      incomingStatusHistoryDraft,
      phase2Merged,
    )
  }

  function finalizePreview(
    est: Establishment[],
    insp: Inspection[],
    statusHistory: EstablishmentStatusHistoryRow[],
    decisions: Map<number, DuplicateAction>,
    duplicatesList: DuplicateInspection[],
    phase2Merged?: ImportSavePhase2Artifacts,
  ) {
    applyStatusHistoryToEstablishments(est, statusHistory)
    // Establishment rows in the workbook replace the premise list — do not keep
    // dashboard-only establishments missing from this file.
    const establishmentsFromWorkbook = mergeEstablishments([], est)

    const inspectionsBlended = mergeInspectionImport({
      baseline: [],
      incomingInspections: insp,
      duplicates: duplicatesList,
      decisionForIndex: decisions,
    })

    const finalInspections =
      dedupeInspectionsByEstablishmentAndDayPreserveOrder(inspectionsBlended)

    debugImportPhase("before preview", {
      previewEstablishments: establishmentsFromWorkbook.length,
      previewStatusHistory: statusHistory.length,
      inspectionsImportedParsed: insp.length,
      duplicatesInFileResolved: duplicatesList.length,
      previewInspectionsDeduped: finalInspections.length,
      areasInData: [...new Set(establishmentsFromWorkbook.map((e) => e.area))],
    })

    const effPhase2 = phase2Merged !== undefined ? phase2Merged : phase2Artifacts
    setProcessed({
      establishments: establishmentsFromWorkbook,
      inspections: finalInspections,
      statusHistory,
      duplicatesResolved: duplicatesList.length,
      phase2Artifacts: phase2ArtifactsNonEmpty(effPhase2) ? effPhase2 : null,
    })
    setDupDialogOpen(false)
    setStep("preview")
  }

  function applyDuplicateResolution() {
    const nextDecisions = new Map(dupDecisionMap)
    const d = duplicates[dupCursor]
    if (!d) return

    if (applyToAllDuplicates) {
      for (const item of duplicates) {
        nextDecisions.set(item.incomingIndex, currentAction)
      }
      setDupDecisionMap(nextDecisions)
      finalizePreview(
        incomingEstablishmentsDraft,
        incomingInspectionsDraft,
        incomingStatusHistoryDraft,
        nextDecisions,
        duplicates,
      )
      return
    }

    nextDecisions.set(d.incomingIndex, currentAction)
    setDupDecisionMap(nextDecisions)

    if (dupCursor < duplicates.length - 1) {
      setDupCursor((c) => c + 1)
      setCurrentAction("update")
      setApplyToAllDuplicates(false)
      return
    }

    finalizePreview(
      incomingEstablishmentsDraft,
      incomingInspectionsDraft,
      incomingStatusHistoryDraft,
      nextDecisions,
      duplicates,
    )
  }

  function resetWizard() {
    setStep("upload")
    setParsed(null)
    setEstMap([])
    setStatusMap([])
    setInspMap([])
    setDuplicates([])
    setDupDecisionMap(new Map())
    setDupDialogOpen(false)
    setDupCursor(0)
    setIncomingEstablishmentsDraft([])
    setIncomingInspectionsDraft([])
    setIncomingStatusHistoryDraft([])
    setProcessed(null)
    setImportBlockError(null)
    setMappingGateBusy(false)
    setPhase2Busy(false)
    setPhase2Detection(null)
    setPhase2Gates([])
    setPhase2GateIdx(0)
    setPhase2Artifacts(emptyPhase2Artifacts())
    setSaveProgress(null)
    setSaveFailState(null)
    setSaveFailureCount(0)
  }

  const currentDup = duplicates[dupCursor]

  function handlePhase2RejectWholeImport() {
    toast.error(t("dataImport.phase2RejectToast"))
    resetWizard()
  }

  function handlePhase2Confirm(payload: Phase2ResolvePayload) {
    payload.applyMutations()
    setPhase2Artifacts(payload.nextArtifacts)
    const nextIdx = phase2GateIdx + 1
    if (nextIdx >= phase2Gates.length) {
      finalizePreviewAfterLastPhase2Gate(payload.nextArtifacts)
      return
    }
    setPhase2GateIdx(nextIdx)
  }

  const phase2Gate = phase2Gates[phase2GateIdx]

  return (
    <div dir={rtl ? "rtl" : "ltr"} className={cn("mx-auto max-w-6xl space-y-6")}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-primary/25 bg-linear-to-br from-primary/14 via-secondary/70 to-accent/70 p-[1px] shadow-md shadow-primary/8",
          "dark:border-primary/30 dark:from-primary/22 dark:to-card/95",
        )}
      >
        <div className={cn("rounded-2xl bg-card px-6 py-6 backdrop-blur-sm sm:py-8", rtl ? "text-end" : "")}>
          <div
            className={cn(
              "flex flex-wrap items-start justify-between gap-4",
              rtl && "flex-row-reverse",
            )}
          >
            <div className={cn("space-y-1", rtl ? "max-w-xl text-end" : "max-w-xl")}>
              <h1 className="text-balance bg-linear-to-br from-[#8B1538] to-[#d4af37] bg-clip-text text-3xl font-bold tracking-tight text-transparent md:text-[2rem]">
                {t("dataImport.title")}
              </h1>
              <p className="max-w-xl text-muted-foreground">{t("dataImport.subtitle")}</p>
            </div>
            <div className={cn("flex shrink-0 flex-wrap items-center gap-2", rtl && "flex-row-reverse")}>
              <span
                className={cn(
                  "rounded-full px-4 py-1 text-xs font-bold shadow-sm uppercase tracking-wider",
                  step === "importBlocked"
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-primary text-primary-foreground",
                )}
              >
                {step === "upload" && t("dataImport.step.upload")}
                {step === "mapping" && t("dataImport.step.mapping")}
                {step === "importBlocked" && t("dataImport.step.importBlocked")}
                {step === "phase2Conflicts" && t("dataImport.step.phase2Conflicts")}
                {step === "duplicates" && t("dataImport.step.duplicates")}
                {step === "preview" && t("dataImport.step.preview")}
              </span>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <div
              className={cn(
                "flex flex-wrap justify-between gap-2 text-xs text-muted-foreground",
                rtl && "flex-row-reverse",
              )}
            >
              <span>{t("dataImport.progressLabel")}</span>
              <span>{wizardProgress}%</span>
            </div>
            <Progress value={wizardProgress} className="h-2" />
          </div>
        </div>
      </div>

      {step === "upload" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-muted-foreground">{t("dataImport.templateHint")}</p>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="gap-2 border-[#d4af37]/40 bg-accent/70 shadow-sm hover:border-primary"
              onClick={() => downloadImportTemplate()}
            >
              <DownloadIcon className="size-4" />
              {t("dataImport.downloadTemplate")}
            </Button>
          </div>

          <Card className={cn(
            "border-2 transition-all duration-200",
            busy && "opacity-70",
          )}
          >
            <CardContent className="p-0">
              <button
                type="button"
                disabled={busy}
                className={cn(
                  getRootProps().className,
                  "relative w-full cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-all duration-300 outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isDragActive
                    ? "border-primary bg-primary/10 shadow-[inset_0_0_0_1px] shadow-primary/20"
                    : "border-muted-foreground/35 bg-muted/35 hover:border-primary/45 hover:bg-primary/10",
                  busy && "pointer-events-none opacity-55",
                )}
                {...getRootProps()}
              >
                <input {...getInputProps()} />

                <div className="flex flex-col items-center gap-5">
                  {busy ? (
                    <Loader2Icon className="size-14 animate-spin text-primary" aria-hidden />
                  ) : (
                    <div className="flex size-[4.75rem] items-center justify-center rounded-full bg-linear-to-br from-primary/95 to-[#6B0F2A]/90 shadow-lg shadow-primary/20">
                      <UploadCloudIcon className="size-10 text-[#fde68a]" aria-hidden />
                    </div>
                  )}
                  <div className={cn("mx-auto max-w-md space-y-2", rtl && "rtl")}>
                    <p className="text-lg font-bold text-foreground">
                      {isDragActive ? t("dataImport.dropHere") : t("dataImport.dragDrop")}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-muted-foreground text-sm">
                      <span className="inline-flex items-center gap-2">
                        <FileSpreadsheetIcon className="size-4 shrink-0" />
                        {t("dataImport.supportedFormats")}: .xlsx, .xls
                      </span>
                      <span>{t("dataImport.maxSize")}: 10 MB</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                    <Button type="button" variant="outline" className="pointer-events-none gap-2" tabIndex={-1}>
                      {t("dataImport.browse")}
                    </Button>
                    <RefreshCwIcon
                      aria-hidden
                      className={cn(
                        "size-5 text-muted-foreground",
                        isDragActive ? "animate-spin duration-700" : "opacity-65",
                      )}
                    />
                  </div>
                  {fileRejections?.length ? (
                    <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-2 text-red-900 text-start text-sm dark:text-red-200">
                      <XCircleIcon className="size-5 shrink-0" />
                      {t("dataImport.invalidFile")}
                    </div>
                  ) : null}
                </div>
              </button>
            </CardContent>
          </Card>
        </div>
      )}

      {step === "importBlocked" && importBlockError && (
        <Card className="border-2 border-destructive/55 bg-destructive/6 shadow-sm dark:bg-destructive/10">
          <CardHeader className={cn(rtl && "text-end")}>
            <CardTitle className="text-destructive text-xl">
              ❌ {t("dataImport.importBlockFailTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className={cn("space-y-4", rtl && "text-end")}>
            {importBlockError.kind === "establishmentsMissingName" ? (
              <div className="space-y-2 text-sm leading-relaxed text-foreground">
                <p>{t("dataImport.importBlockEstMissingNameIntro")}</p>
                <p className="font-medium whitespace-pre-wrap wrap-break-word">
                  {t("dataImport.importBlockRowsLine", {
                    rows: formatInspectionValidationRowList(importBlockError.rows),
                  })}
                </p>
              </div>
            ) : null}

            {importBlockError.kind === "statusHistoryUnknownEstablishments" ? (
              <div className="space-y-2 text-sm leading-relaxed text-foreground">
                <p>{t("dataImport.importBlockStatusUnknownIntro")}</p>
                <ul className={cn("list-none space-y-2", rtl ? "text-end" : "text-start")}>
                  {importBlockError.items.map((item) => (
                    <li key={`${item.displayName}-${item.rows[0]}`} className="wrap-break-word">
                      {t("dataImport.importBlockUnknownEstLine", {
                        name: item.displayName,
                        rows: formatInspectionValidationRowList(item.rows),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {importBlockError.kind === "statusHistoryMissingFields" ? (
              <div className="space-y-2 text-sm leading-relaxed text-foreground">
                <p>{t("dataImport.importBlockStatusFieldsIntro")}</p>
                <ul className="list-none space-y-2">
                  {importBlockError.missingYearRows.length > 0 ? (
                    <li>
                      {t("dataImport.importBlockStatusMissingYearLine", {
                        count: new Set(importBlockError.missingYearRows).size,
                        rows: formatInspectionValidationRowList(
                          importBlockError.missingYearRows,
                        ),
                      })}
                    </li>
                  ) : null}
                  {importBlockError.missingStatusRows.length > 0 ? (
                    <li>
                      {t("dataImport.importBlockStatusMissingStatusLine", {
                        count: new Set(importBlockError.missingStatusRows).size,
                        rows: formatInspectionValidationRowList(
                          importBlockError.missingStatusRows,
                        ),
                      })}
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {importBlockError.kind === "inspectionsUnknownEstablishments" ? (
              <div className="space-y-2 text-sm leading-relaxed text-foreground">
                <p>{t("dataImport.importBlockInspectionsUnknownIntro")}</p>
                <ul className={cn("list-none space-y-2", rtl ? "text-end" : "text-start")}>
                  {importBlockError.items.map((item) => (
                    <li key={`${item.displayName}-${item.rows[0]}`} className="wrap-break-word">
                      {t("dataImport.importBlockUnknownEstLine", {
                        name: item.displayName,
                        rows: formatInspectionValidationRowList(item.rows),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {importBlockError.kind === "inspectionsStrictDateRating" ? (
              <div className="space-y-2 text-sm leading-relaxed text-foreground">
                <p>{t("dataImport.inspectionStrictFailIntro")}</p>
                <ul className="list-none space-y-2">
                  {importBlockError.dateRows.length > 0 ? (
                    <li>
                      {t("dataImport.inspectionStrictFailDateLine", {
                        count: new Set(importBlockError.dateRows).size,
                        rows: formatInspectionValidationRowList(importBlockError.dateRows),
                      })}
                    </li>
                  ) : null}
                  {importBlockError.ratingRows.length > 0 ? (
                    <li>
                      {t("dataImport.inspectionStrictFailRatingLine", {
                        count: new Set(importBlockError.ratingRows).size,
                        rows: formatInspectionValidationRowList(importBlockError.ratingRows),
                      })}
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {importBlockError.kind === "phase1EstablishmentAreaLocation" ? (
              <div className="space-y-2 text-sm leading-relaxed text-foreground">
                <p>{t("dataImport.phase1EstablishmentAreaLocationIntro")}</p>
                <ul className="list-none space-y-2">
                  {importBlockError.missingAreaRows.length > 0 ? (
                    <li>
                      {t("dataImport.phase1EstablishmentWithoutAreaLine", {
                        count: importBlockError.missingAreaRows.length,
                        rows: formatInspectionValidationRowList(
                          importBlockError.missingAreaRows,
                        ),
                      })}
                    </li>
                  ) : null}
                  {importBlockError.missingLocationRows.length > 0 ? (
                    <li>
                      {t("dataImport.phase1EstablishmentWithoutLocationLine", {
                        count: importBlockError.missingLocationRows.length,
                        rows: formatInspectionValidationRowList(
                          importBlockError.missingLocationRows,
                        ),
                      })}
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {importBlockError.kind === "phase1EstablishmentDuplicates" ? (
              <div className="space-y-2 text-sm leading-relaxed text-foreground">
                <p>{t("dataImport.phase1EstablishmentDupIntro")}</p>
                <ul className={cn("list-none space-y-2", rtl ? "text-end" : "text-start")}>
                  {importBlockError.items.map((item) => (
                    <li key={`${item.display}-${item.rows[0]}`} className="wrap-break-word">
                      {t("dataImport.phase1EstablishmentDupLine", {
                        display: item.display,
                        rows: formatInspectionValidationRowList(item.rows),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {importBlockError.kind === "phase1StatusHistoryDuplicates" ? (
              <div className="space-y-2 text-sm leading-relaxed text-foreground">
                <p>{t("dataImport.phase1StatusHistoryDupIntro")}</p>
                <ul className={cn("list-none space-y-2", rtl ? "text-end" : "text-start")}>
                  {importBlockError.items.map((item) => (
                    <li key={`${item.display}-${item.rows[0]}`} className="wrap-break-word">
                      {t("dataImport.phase1StatusHistoryDupLine", {
                        display: item.display,
                        rows: formatInspectionValidationRowList(item.rows),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {importBlockError.kind === "phase1YearsInactive" ? (
              <div className="space-y-2 text-sm leading-relaxed text-foreground">
                <p>{t("dataImport.phase1YearsInactiveIntro")}</p>
                <ul className={cn("list-none space-y-2", rtl ? "text-end" : "text-start")}>
                  {importBlockError.items.map((item) => (
                    <li key={item.year} className="wrap-break-word">
                      {t("dataImport.phase1YearsInactiveLine", {
                        year: item.year,
                        statusRows:
                          item.statusHistoryRows.length > 0
                            ? formatInspectionValidationRowList(item.statusHistoryRows)
                            : t("dataImport.phase1NoRowsPlaceholder"),
                        inspRows:
                          item.inspectionsRows.length > 0
                            ? formatInspectionValidationRowList(item.inspectionsRows)
                            : t("dataImport.phase1NoRowsPlaceholder"),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {importBlockError.kind === "phase1InspectionFutureDates" ? (
              <div className="space-y-2 text-sm leading-relaxed text-foreground">
                <p>{t("dataImport.phase1InspectionFutureIntro")}</p>
                <ul className={cn("list-none space-y-2", rtl ? "text-end" : "text-start")}>
                  {importBlockError.items.map((item) => (
                    <li key={`${item.row}-${item.establishmentName}`} className="wrap-break-word">
                      {t("dataImport.phase1InspectionFutureLine", {
                        name: item.establishmentName,
                        date: item.dateDdMmYyyy,
                        row: item.row,
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {importBlockError.kind === "phase2UnknownInspectors" ? (
              <div className="space-y-2 text-sm leading-relaxed text-foreground">
                <p>{t("dataImport.phase2UnknownInspectorsIntro")}</p>
                <ul className={cn("list-none space-y-2", rtl ? "text-end" : "text-start")}>
                  {importBlockError.items.map((item) => (
                    <li
                      key={`${item.inspectorName}-${item.rows[0] ?? ""}`}
                      className="wrap-break-word"
                    >
                      {t("dataImport.phase2UnknownInspectorsLine", {
                        name: item.inspectorName,
                        rows: formatInspectionValidationRowList(item.rows),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-muted-foreground text-sm">
              {importBlockError.kind === "phase1YearsInactive"
                ? t("dataImport.phase1YearsInactiveFooter")
                : importBlockError.kind === "phase2UnknownInspectors"
                  ? t("dataImport.phase2UnknownInspectorsFooter")
                  : t("dataImport.importBlockFooter")}
            </p>
            <div className={cn("flex pt-2", rtl ? "justify-start" : "justify-end")}>
              <Button
                type="button"
                variant="gold"
                className="gap-2"
                onClick={() => resetWizard()}
              >
                <UploadCloudIcon className="size-4" aria-hidden />
                {t("dataImport.uploadNewFile")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "mapping" && parsed && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{t("dataImport.columnMapping")}</h2>
              <p className="text-sm text-muted-foreground">{t("dataImport.verifyMapping")}</p>
            </div>
            <Button variant="outline" type="button" onClick={() => resetWizard()} className="gap-2">
              <ArrowLeftIcon className="size-4" />
              {t("dataImport.back")}
            </Button>
          </div>

          {(estMissing.length > 0 || inspMissing.length > 0 || statusMissing.length > 0 || duplicateFieldCollisions) && (
            <div className="flex items-start gap-3 rounded-xl border border-red-900/35 bg-[#8b1538]/8 p-4 dark:border-red-400/35 dark:bg-red-950/25">
              <AlertTriangleIcon className="mt-1 size-5 shrink-0 text-[#c2410c]" />
              <div className={cn("min-w-0 space-y-2", rtl && "text-end")}>
                <p className="font-semibold text-red-950 dark:text-red-100">
                  {t("dataImport.mappingIssues")}
                </p>
                {estMissing.map((r) => (
                  <div key={`e-${r.id}`} className="text-muted-foreground text-sm">
                    {t(`dataImport.establishmentsSheet`)}{" · "}{t(`dataImport.fields.${r.id}` as "dataImport.fields.area")}
                  </div>
                ))}
                {inspMissing.map((r) => (
                  <div key={`i-${r.id}`} className="text-muted-foreground text-sm">
                    {t(`dataImport.inspectionsSheet`)}{" · "}{t(`dataImport.fields.${r.id}` as "dataImport.fields.area")}
                  </div>
                ))}
                {statusMissing.map((r) => (
                  <div key={`s-${r.id}`} className="text-muted-foreground text-sm">
                    {t(`dataImport.statusHistorySheet`)}{" · "}{t(`dataImport.fields.${r.id}` as "dataImport.fields.area")}
                  </div>
                ))}
                {duplicateFieldCollisions && (
                  <p className="text-muted-foreground text-sm">{t("dataImport.duplicateFieldMap")}</p>
                )}
              </div>
            </div>
          )}

          <MappingSection
            title={t("dataImport.sheetEstablishments")}
            description={t("dataImport.sheetEstablishmentsHint")}
            mapping={estMap}
            meta={EST_FIELD_META}
            onChange={setEstMap}
            rtl={rtl}
          />

          <MappingSection
            title={t("dataImport.sheetStatusHistory")}
            description={t("dataImport.sheetStatusHistoryHint")}
            mapping={statusMap}
            meta={STATUS_FIELD_META}
            onChange={setStatusMap}
            rtl={rtl}
          />

          <MappingSection
            title={t("dataImport.sheetInspections")}
            description={t("dataImport.sheetInspectionsHint")}
            mapping={inspMap}
            meta={INSP_FIELD_META}
            onChange={setInspMap}
            rtl={rtl}
          />

          <div className={cn("flex gap-4", rtl ? "flex-row-reverse justify-between" : "justify-between")}>
            <Button variant="outline" type="button" onClick={() => resetWizard()} className="gap-2">
              <ArrowLeftIcon className="size-4" />
              {t("dataImport.back")}
            </Button>
            <Button
              type="button"
              variant="gold"
              className={cn(
                "min-w-[10rem] gap-2 rounded-xl px-8 py-6 font-semibold shadow-md",
                rtl && "flex-row-reverse",
              )}
              onClick={() => void goMappingContinue()}
              disabled={Boolean(
                estMissing.length ||
                  inspMissing.length ||
                  statusMissing.length ||
                  duplicateFieldCollisions ||
                  mappingGateBusy ||
                  phase2Busy,
              )}
            >
              {mappingGateBusy || phase2Busy ? (
                <Loader2Icon className="size-4 shrink-0 animate-spin" aria-hidden />
              ) : null}
              {mappingGateBusy || phase2Busy
                ? t("dataImport.mappingGateBusy")
                : t("dataImport.continue")}
              {!mappingGateBusy && !phase2Busy ? <ArrowRightIcon className="size-4" /> : null}
            </Button>
          </div>
        </div>
      )}

      {step === "phase2Conflicts" && phase2Gate && phase2Detection && parsed ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{t("dataImport.phase2StepHeading")}</h2>
              <p className="text-muted-foreground text-sm">{t("dataImport.phase2StepHint")}</p>
            </div>
            <Button variant="outline" type="button" onClick={() => resetWizard()} className="gap-2">
              <ArrowLeftIcon className="size-4" />
              {t("dataImport.back")}
            </Button>
          </div>

          <ImportPhase2Panel
            gate={phase2Gate}
            gateIndexDisplay={phase2GateIdx + 1}
            gatesTotal={phase2Gates.length}
            detection={phase2Detection}
            artifactAccum={phase2Artifacts}
            drafts={{
              establishments: incomingEstablishmentsDraft,
              inspections: incomingInspectionsDraft,
              statusHistory: incomingStatusHistoryDraft,
            }}
            rtl={rtl}
            t={t}
            onConfirm={(p) => handlePhase2Confirm(p)}
            onRejectWholeImport={() => handlePhase2RejectWholeImport()}
          />
        </div>
      ) : null}

      <Dialog
        open={dupDialogOpen}
        onOpenChange={(open) => {
          setDupDialogOpen(open)
          if (!open && step === "duplicates") {
            setStep("mapping")
            toast.success(t("dataImport.dupDismissed"))
          }
        }}
      >
        {currentDup && (
          <DialogContent
            dir={rtl ? "rtl" : "ltr"}
            className="max-h-[calc(100dvh-2rem)] gap-6 overflow-y-auto border-[#eab308]/30 sm:max-w-2xl"
          >
            <DialogHeader className={rtl ? "sm:text-end" : "text-start"}
            >
              <DialogTitle
                className={cn(
                  "flex flex-wrap items-start gap-2 text-xl",
                  rtl && "flex-row-reverse sm:justify-end",
                )}
              >
                <AlertTriangleIcon className="size-6 shrink-0 text-amber-600" />
                {t("dataImport.duplicateFound")}
                <BadgeCursor idx={dupCursor} total={duplicates.length} />
              </DialogTitle>
            </DialogHeader>

            <div className="rounded-xl bg-amber-500/14 px-5 py-4">
              <p className="text-lg font-bold">{currentDup.establishmentName}</p>
              <p className="text-muted-foreground text-sm uppercase tracking-wide">
                {formatInspectionDateDdMmYyyy(
                  currentDup.inspectionDate,
                  t("common.dateUnknown"),
                )}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className={cn(
                  "space-y-2 rounded-lg border bg-card p-4",
                  rtl && "text-start",
                  !rtl && "text-start",
                )}
                >
                  <div className="font-semibold text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {t("dataImport.existingData")}
                  </div>
                  <ul className="space-y-1 text-sm">
                    <li>
                      {t("dataImport.rating")}: {currentDup.existing.rating}
                    </li>
                    <li>
                      {t("dataImport.reference")}: {currentDup.existing.refNumber || "—"}
                    </li>
                    <li>
                      {t("dataImport.inspector")}: {currentDup.existing.inspector}
                    </li>
                  </ul>
                </div>
                <div className="space-y-2 rounded-lg border border-primary/35 bg-linear-to-bl from-[#fde68a]/18 to-transparent p-4">
                  <div className="font-semibold text-xs uppercase tracking-[0.2em] text-primary">
                    {t("dataImport.newData")}
                  </div>
                  <ul className="space-y-1 text-sm">
                    <li>
                      {t("dataImport.rating")}: {currentDup.incoming.rating}
                    </li>
                    <li>
                      {t("dataImport.reference")}: {currentDup.incoming.refNumber || "—"}
                    </li>
                    <li>
                      {t("dataImport.inspector")}: {currentDup.incoming.inspector}
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className={cn("space-y-4", rtl && "text-end")}>
              <p className="font-semibold">{t("dataImport.selectAction")}</p>
              <div className="grid gap-2">
                {( [
                  ["update", t("dataImport.update"), t("dataImport.updateDesc")],
                  ["delete_old", t("dataImport.deleteOld"), t("dataImport.deleteOldDesc")],
                  ["delete_new", t("dataImport.deleteNew"), t("dataImport.deleteNewDesc")],
                  ["skip", t("dataImport.skip"), t("dataImport.skipDesc")],
                ] as const satisfies [DuplicateAction, string, string][]).map(
                  ([value, label, hint]) => (
                    <label
                      key={value}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-accent/65",
                        currentAction === value && "border-primary bg-primary/7 ring-2 ring-primary",
                        rtl && "flex-row-reverse",
                      )}
                    >
                      <input
                        type="radio"
                        name="dup-action"
                        value={value}
                        checked={currentAction === value}
                        className={cn(
                          "mt-1 accent-primary shrink-0",
                          rtl ? "translate-x-[1px]" : "",
                        )}
                        onChange={() => setCurrentAction(value)}
                      />
                      <span className="leading-snug select-none space-y-0.5 font-medium [&>span:last-child]:text-muted-foreground [&>span:last-child]:text-xs [&>span:last-child]:font-normal [&>span:last-child]:block">
                        <span>{label}</span>
                        <span>{hint}</span>
                      </span>
                    </label>
                  ),
                )}
              </div>
            </div>

            <Label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border border-secondary bg-secondary/65 p-3",
                rtl && "flex-row-reverse",
              )}
            >
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 rounded border-input accent-[#ca8a04]"
                checked={applyToAllDuplicates}
                onChange={(e) => setApplyToAllDuplicates(e.target.checked)}
              />
              <span className="text-sm leading-relaxed select-none font-medium">
                {t("dataImport.applyToAll")}{" "}
                ({t("dataImport.duplicatesCount", { count: duplicates.length })})
              </span>
            </Label>

            <DialogFooter
              className={cn(
                "gap-4 sm:flex-col sm:gap-6",
                rtl
                  ? "flex-col items-stretch sm:flex-row-reverse sm:justify-between"
                  : "",
              )}
            >
              <Button
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => setDupDialogOpen(false)}
              >
                {t("dataImport.cancel")}
              </Button>

              <Button
                variant="gold"
                type="button"
                disabled={busy}
                className="gap-3 font-semibold"
                onClick={() => applyDuplicateResolution()}
              >
                {dupCursor < duplicates.length - 1 && !applyToAllDuplicates
                  ? t("dataImport.nextDup")
                  : t("dataImport.continue")}
                {!applyToAllDuplicates && duplicates.length ? (
                  <span className="rounded-full bg-primary-foreground/15 px-2 py-px text-[11px]">
                    {(dupCursor + 1)}
                    /
                    {(duplicates.length)}
                  </span>
                ) : null}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {step === "preview" && processed && (
        <Card className={cn("border-border shadow-md", rtl && "text-end")}>
          <CardHeader className={cn("pb-3", rtl ? "items-end" : "items-start")}
          >
            <CardTitle className={cn("w-full", rtl ? "text-end" : "text-start")}
            >
              {t("preview.finalValidation")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-10 pt-2">
            {saveFailState ? (
              <Card className="border-2 border-destructive/55 bg-destructive/6 shadow-sm dark:bg-destructive/10">
                <CardHeader className={cn(rtl && "text-end")}
                >
                  <CardTitle className="text-destructive text-xl">
                    {saveFailureCount >= 4 ? (
                      <span>
                        ⚠️ {t("dataImport.saveFailRetriesExhaustedTitle")}
                      </span>
                    ) : (
                      <>
                        ❌{" "}
                        {saveFailState.kind === "network"
                          ? t("dataImport.saveFailNetworkTitle")
                          : saveFailState.kind === "timeout"
                            ? t("dataImport.saveFailTimeoutTitle")
                            : t("dataImport.saveFailGenericTitle")}
                      </>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className={cn("space-y-3 text-sm", rtl && "text-end")}
                >
                  {saveFailureCount >= 4 ? (
                    <p className="leading-relaxed">{t("dataImport.saveFailRetriesExhaustedBody")}</p>
                  ) : saveFailState.kind === "network" ? (
                    <>
                      <p>{t("dataImport.saveFailNetworkIntro")}</p>
                      <ul className={cn("list-none space-y-2", rtl ? "text-end" : "text-start")}
                      >
                        <li className="wrap-break-word">• {t("dataImport.saveFailNetworkB1")}</li>
                        <li className="wrap-break-word">• {t("dataImport.saveFailNetworkB2")}</li>
                        <li className="wrap-break-word">• {t("dataImport.saveFailNetworkB3")}</li>
                      </ul>
                    </>
                  ) : saveFailState.kind === "timeout" ? (
                    <>
                      <p>{t("dataImport.saveFailTimeoutIntro")}</p>
                      <ul className={cn("list-none space-y-2", rtl ? "text-end" : "text-start")}
                      >
                        <li className="wrap-break-word">• {t("dataImport.saveFailTimeoutB1")}</li>
                        <li className="wrap-break-word">• {t("dataImport.saveFailTimeoutB2")}</li>
                      </ul>
                    </>
                  ) : (
                    <>
                      <p>{t("dataImport.saveFailGenericIntro")}</p>
                      <p className="font-medium wrap-break-word">
                        {t("dataImport.saveFailGenericDetail", { detail: saveFailState.detail })}
                      </p>
                    </>
                  )}
                  <div className={cn("flex flex-wrap gap-3 pt-2", rtl ? "justify-start" : "justify-end")}
                  >
                    <Button type="button" variant="outline" className="gap-2" onClick={() => resetWizard()}>
                      <UploadCloudIcon className="size-4" aria-hidden />
                      {t("dataImport.uploadNewFile")}
                    </Button>
                    {saveFailureCount > 0 && saveFailureCount < 4 ? (
                      <Button
                        type="button"
                        variant="gold"
                        className="gap-2"
                        disabled={saveBusy}
                        onClick={() => void saveToSupabase()}
                      >
                        {saveBusy ? (
                          <Loader2Icon className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <RefreshCwIcon className="size-4" aria-hidden />
                        )}
                        {t("dataImport.saveRetry")}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ) : saveBusy && saveProgress ? (
              <div
                dir={rtl ? "rtl" : "ltr"}
                className="rounded-xl border border-primary/30 bg-linear-to-bl from-[#fcd34d]/18 to-accent/65 px-4 py-4 shadow-sm dark:from-amber-950/30"
              >
                <p className="mb-3 flex flex-wrap items-center gap-2 font-semibold">
                  {saveBusy ? <Loader2Icon className="size-5 animate-spin text-primary" aria-hidden /> : null}
                  {t("dataImport.saveProgressHeading")}
                </p>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  {(["establishments", "statusHistory", "inspections"] as const).map((kind) => {
                    const glyph =
                      importSavePhaseRowIcon(saveProgress, kind) === "done"
                        ? "✅"
                        : importSavePhaseRowIcon(saveProgress, kind) === "busy"
                          ? "⏳"
                          : "⏸"
                    const sub =
                      saveProgress[kind].total == null
                        ? "—"
                        : `${saveProgress[kind].done}/${saveProgress[kind].total}`
                    return (
                      <li key={kind}>
                        <span aria-hidden>{glyph}</span>{" "}
                        {kind === "establishments"
                          ? t("dataImport.saveProgressEstablishmentsLine", {
                              counts: sub,
                            })
                          : kind === "statusHistory"
                            ? t("dataImport.saveProgressStatusLine", {
                                counts: sub,
                              })
                            : t("dataImport.saveProgressInspectionsLine", {
                                counts: sub,
                              })}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}

            {!saveFailState ? (
              <>
            <div
              className={cn(
                "grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
                rtl &&
                  "[direction:rtl] justify-items-stretch [&_.font-bold]:tracking-tight",
              )}
            >
              <StatBadge
                accent="purple"
                label={t("dataImport.establishments")}
                count={processed.establishments.length}
                rtl={rtl}
              />
              <StatBadge
                accent="blue"
                label={t("dataImport.statusHistory")}
                count={processed.statusHistory.length}
                rtl={rtl}
              />
              <StatBadge
                accent="gold"
                label={t("dataImport.inspections")}
                count={processed.inspections.length}
                rtl={rtl}
              />
              <StatBadge
                accent="emerald"
                label={t("dataImport.duplicatesResolved")}
                count={processed.duplicatesResolved}
                rtl={rtl}
              />
            </div>

            <div className="space-y-3">
              <h4 className={cn("font-semibold", rtl ? "text-end" : "text-start")}
              >
                {t("preview.establishmentsPreview")}
              </h4>
              <div
                className={cn(
                  "-mx-[1px] max-h-[500px] overflow-auto overscroll-contain rounded-xl border border-border shadow-inner",
                  rtl && "[direction:rtl]",
                )}
              >
                <table
                  className={cn(
                    "min-w-[880px] w-full border-collapse divide-y divide-border bg-card",
                    rtl && "[&_th]:text-end [&_td]:text-end",
                  )}
                >
                  <thead className="sticky top-0 z-[1] bg-muted/92 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                    <tr>
                      <th className="px-3 py-3 font-semibold">{t("preview.rowIndex")}</th>
                      <th className="px-3 py-3 font-semibold">{t("preview.establishmentName")}</th>
                      <th className="px-3 py-3 font-semibold">{t("preview.nameInEms")}</th>
                      <th className="px-3 py-3 font-semibold">{t("preview.area")}</th>
                      <th className="px-3 py-3 font-semibold">{t("preview.nbOutlets")}</th>
                      <th className="px-3 py-3 font-semibold">{t("preview.operationalStatus")}</th>
                      <th className="px-3 py-3 font-semibold">{t("preview.notes")}</th>
                    </tr>
                  </thead>
                  <tbody className={cn(
                    "divide-y divide-border text-sm",
                    rtl && "[&_td]:text-end",
                  )}
                  >
                    {processed.establishments.map((row, idx) => (
                      <tr key={`est-${row.id}-${idx}`} className="hover:bg-muted/52">
                        <td className="tabular-nums px-3 py-3 text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-3 font-medium">{row.name}</td>
                        <td className="px-3 py-3">{row.nameInEms?.trim() || "—"}</td>
                        <td className="px-3 py-3">{String(row.area)}</td>
                        <td className="px-3 py-3 tabular-nums">
                          {row.nbOutlets != null && Number.isFinite(row.nbOutlets)
                            ? row.nbOutlets
                            : "—"}
                        </td>
                        <td className="px-3 py-3">{String(row.operationalStatus)}</td>
                        <td className="px-3 py-3">{row.establishmentNote?.trim() || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className={cn("font-semibold", rtl ? "text-end" : "text-start")}
              >
                {t("preview.inspectionsPreview")}
              </h4>
              <div
                className={cn(
                  "-mx-[1px] max-h-[500px] overflow-auto overscroll-contain rounded-xl border border-border shadow-inner",
                  rtl && "[direction:rtl]",
                )}
              >
                <table
                  className={cn(
                    "min-w-[800px] w-full border-collapse divide-y divide-border bg-card",
                    rtl && "[&_th]:text-end [&_td]:text-end",
                  )}
                >
                  <thead className="sticky top-0 z-[1] bg-muted/92 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                    <tr>
                      <th className="px-3 py-3 font-semibold">{t("preview.establishmentName")}</th>
                      <th className="px-3 py-3 font-semibold">{t("preview.inspectionDate")}</th>
                      <th className="px-3 py-3 font-semibold">{t("preview.rating")}</th>
                      <th className="px-3 py-3 font-semibold">{t("preview.inspector")}</th>
                      <th className="px-3 py-3 font-semibold">{t("preview.taskType")}</th>
                      <th className="px-3 py-3 font-semibold">{t("preview.referenceNumber")}</th>
                    </tr>
                  </thead>
                  <tbody className={cn("divide-y divide-border text-sm", rtl && "[&_td]:text-end")}>
                    {processed.inspections.map((row, idx) => (
                      <tr
                        key={`insp-${row.refNumber ?? "noref"}-${row.inspectionDate?.getTime() ?? "nodate"}-${row.rating}-${idx}`}
                        className="hover:bg-muted/52"
                      >
                        <td className="px-3 py-3 font-medium">{row.establishmentName}</td>
                        <td className="px-3 py-3 tabular-nums">
                          {formatInspectionDateDdMmYyyy(
                            row.inspectionDate,
                            t("common.dateUnknown"),
                          )}
                        </td>
                        <td className="px-3 py-3">{row.rating}</td>
                        <td className="px-3 py-3">{row.inspector}</td>
                        <td className="px-3 py-3">{row.taskType?.trim() || "—"}</td>
                        <td className="px-3 py-3">{row.refNumber || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            </>
            ) : null}

            <div className={cn("flex gap-8 pt-2", rtl ? "justify-between flex-row-reverse" : "justify-between")}
            >
              <Button
                variant="outline"
                size="lg"
                className={cn(!rtl ? "rounded-xl px-8" : "rounded-xl")}
                type="button"
                onClick={() => resetWizard()}
              >
                <ArrowLeftIcon className="mx-4 size-4" aria-hidden /> {t("preview.cancel")}
              </Button>

              <Button
                variant="gold"
                type="button"
                disabled={saveBusy || busy || Boolean(saveFailState)}
                className={cn(
                  "gap-2 rounded-xl px-10 py-6 font-bold shadow-xl",
                  rtl && "flex-row-reverse",
                )}
                onClick={() => void saveToSupabase()}
              >
                {saveBusy ? (
                  <Loader2Icon className="mx-px size-[19px] animate-spin" aria-hidden />
                ) : (
                  <SaveIcon className="mx-px size-[19px]" aria-hidden />
                )}
                <span>{t("preview.saveData")}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function BadgeCursor({ idx, total }: { idx: number; total: number }) {
  return (
    <span className="ms-auto inline-flex shrink-0 items-center gap-6 rounded-full border border-border px-8 py-[4px] text-xs font-semibold whitespace-nowrap text-muted-foreground">
      {(idx + 1)}
      /
      {(total)}
    </span>
  )
}

const STAT_ACCENT_CLASSES: Record<"purple" | "gold" | "emerald" | "blue", string> = {
  purple:
    "border-violet-500/45 bg-linear-to-bl from-[#e9d5ff]/75 to-muted/92 dark:to-card/93",
  blue: "border-sky-500/45 bg-linear-to-bl from-sky-200/85 to-muted/92 dark:to-card/93",
  gold: "border-[#d4af3755] bg-linear-to-bl from-[#fcd34de6] to-accent/93 dark:to-accent/93",
  emerald:
    "border-emerald-900/62 bg-linear-to-bl from-emerald-200/78 to-accent/92 dark:to-accent/93",
}

function StatBadge(props: {
  label: string
  count: number
  accent: keyof typeof STAT_ACCENT_CLASSES
  rtl?: boolean
}) {
  const cls = STAT_ACCENT_CLASSES[props.accent] ?? ""

  return (
    <div
      className={cn(
        "rounded-xl border shadow-sm backdrop-blur-xl space-y-[3px] px-8 py-[18px]",
        props.rtl ? "text-end" : "",
        cls,
      )}
    >
      <p className="text-muted-foreground text-[11px] font-bold uppercase tracking-[0.2em]">
        {props.label}
      </p>
      <div className="font-bold text-foreground text-[2rem]">{props.count}</div>
    </div>
  )
}
