import { useMemo, useState } from "react"
import { AlertTriangleIcon } from "lucide-react"
import type { TFunction } from "i18next"

import type { Establishment, Inspection } from "@/data/rawData"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  formatInspectionValidationRowList,
  applyStatusHistoryToEstablishments,
  type EstablishmentStatusHistoryRow,
} from "@/features/data-import/mergePipeline"
import { estNormKey } from "@/features/data-import/phase2Detection"
import {
  emptyPhase2Artifacts,
  mergePhase2Artifacts,
} from "@/features/data-import/phase2ArtifactsMerge"
import type { ImportSavePhase2Artifacts, Phase2DetectionResult } from "@/features/data-import/phase2ImportTypes"
import {
  renameEstablishmentAcrossDrafts,
  replaceInspectorLabelInInspections,
  linkInspectionsToEstablishmentName,
  cloneEstablishmentAsNew,
} from "@/features/data-import/phase2DraftMutations"

export type Phase2Gate =
  | "establishmentCase"
  | "establishmentData"
  | "statusHistory"
  | "inspectorFuzzy"
  | "inspectionEstablishment"

export type Phase2ResolvePayload = {
  nextArtifacts: ImportSavePhase2Artifacts
  /** Run after `nextArtifacts` is committed; mutates draft arrays in place. */
  applyMutations: () => void
}

type Props = {
  gate: Phase2Gate
  gateIndexDisplay: number
  gatesTotal: number
  detection: Phase2DetectionResult
  artifactAccum: ImportSavePhase2Artifacts
  drafts: {
    establishments: Establishment[]
    inspections: Inspection[]
    statusHistory: EstablishmentStatusHistoryRow[]
  }
  rtl: boolean
  t: TFunction
  onConfirm: (payload: Phase2ResolvePayload) => void
  onRejectWholeImport: () => void
}

function findEstablishmentByNormKey(
  establishments: Establishment[],
  normKey: string,
): Establishment | undefined {
  return establishments.find((e) => estNormKey(e.name) === normKey)
}

export function ImportPhase2Panel(props: Props) {
  const {
    gate,
    gateIndexDisplay,
    gatesTotal,
    detection,
    artifactAccum,
    drafts,
    rtl,
    t,
    onConfirm,
    onRejectWholeImport,
  } = props

  const [applyAllSimilar, setApplyAllSimilar] = useState(false)

  const caseRows = detection.establishmentCaseConflicts
  const [caseChoice, setCaseChoice] = useState<Record<string, "canonical" | "newRow">>(() =>
    Object.fromEntries(caseRows.map((c) => [c.normKey, "canonical" as const])),
  )

  const dataRows = detection.establishmentDataConflicts
  const [dataChoice, setDataChoice] = useState<Record<string, "overwrite" | "newRow">>(() =>
    Object.fromEntries(dataRows.map((r) => [r.normKey, "overwrite" as const])),
  )

  const statusRows = detection.statusHistoryConflicts
  const [statusRejectMap, setStatusRejectMap] = useState<Record<string, boolean>>({})

  const inspFuzzy = detection.inspectorFuzzyConflicts
  const [inspectorRejectMap, setInspectorRejectMap] = useState<Record<string, boolean>>({})

  const inspEstRows = detection.inspectionEstablishmentConflicts
  const [inspEstChoice, setInspEstChoice] = useState<Record<string, "link" | "new" | "reject">>(() =>
    Object.fromEntries(
      inspEstRows.map((r) => [r.inspectionsSheetDisplayName, "link" as const]),
    ),
  )

  const resolvedCaseChoice = useMemo(() => {
    if (!applyAllSimilar || caseRows.length === 0 || gate !== "establishmentCase") {
      return caseChoice
    }
    const v = caseChoice[caseRows[0]!.normKey] ?? "canonical"
    return Object.fromEntries(caseRows.map((c) => [c.normKey, v]))
  }, [applyAllSimilar, caseChoice, caseRows, gate])

  const resolvedDataChoice = useMemo(() => {
    if (!applyAllSimilar || dataRows.length === 0 || gate !== "establishmentData") {
      return dataChoice
    }
    const v = dataChoice[dataRows[0]!.normKey] ?? "overwrite"
    return Object.fromEntries(dataRows.map((c) => [c.normKey, v]))
  }, [applyAllSimilar, dataChoice, dataRows, gate])

  function buildPayload(): Phase2ResolvePayload | null {
    if (gate === "establishmentCase") {
      const delta = emptyPhase2Artifacts()
      for (const c of caseRows) {
        const ch = resolvedCaseChoice[c.normKey] ?? "canonical"
        if (ch === "newRow") delta.omitNameDedupeNormKeys!.push(c.normKey)
      }
      const nextArtifacts = mergePhase2Artifacts(artifactAccum, delta)
      return {
        nextArtifacts,
        applyMutations: () => {
          for (const c of caseRows) {
            const ch = resolvedCaseChoice[c.normKey] ?? "canonical"
            if (ch === "canonical") {
              renameEstablishmentAcrossDrafts(
                c.normKey,
                c.dbDisplayName,
                drafts.establishments,
                drafts.statusHistory,
                drafts.inspections,
              )
            }
          }
        },
      }
    }

    if (gate === "establishmentData") {
      const delta = emptyPhase2Artifacts()
      for (const row of dataRows) {
        const ch = resolvedDataChoice[row.normKey] ?? "overwrite"
        if (ch === "newRow") delta.omitNameDedupeNormKeys!.push(row.normKey)
        else {
          const src = findEstablishmentByNormKey(drafts.establishments, row.normKey)
          if (src) {
            delta.establishmentUpdates!.push({
              dbEstablishmentId: row.dbEstablishmentId,
              fileEstablishment: { ...src },
            })
          }
        }
      }
      return {
        nextArtifacts: mergePhase2Artifacts(artifactAccum, delta),
        applyMutations: () => {},
      }
    }

    if (gate === "statusHistory") {
      const delta = emptyPhase2Artifacts()
      for (const s of statusRows) {
        const k = `${s.dbEstablishmentId}|${s.calendarYear}`
        if (statusRejectMap[k]) {
          onRejectWholeImport()
          return null
        }
        delta.statusHistoryUpserts!.push({
          dbEstablishmentId: s.dbEstablishmentId,
          calendarYear: s.calendarYear,
          operationalStatus: s.fileStatus,
        })
      }
      return {
        nextArtifacts: mergePhase2Artifacts(artifactAccum, delta),
        applyMutations: () => {},
      }
    }

    if (gate === "inspectorFuzzy") {
      for (const f of inspFuzzy) {
        if (inspectorRejectMap[f.key]) {
          onRejectWholeImport()
          return null
        }
      }
      return {
        nextArtifacts: artifactAccum,
        applyMutations: () => {
          for (const f of inspFuzzy) {
            replaceInspectorLabelInInspections(drafts.inspections, f.key, f.canonicalInspectorName)
          }
        },
      }
    }

    /** inspectionEstablishment */
    const delta = emptyPhase2Artifacts()
    for (const row of inspEstRows) {
      const ch = inspEstChoice[row.inspectionsSheetDisplayName] ?? "link"
      if (ch === "reject") {
        onRejectWholeImport()
        return null
      }
      if (ch === "new") {
        const primary = row.inspectionsSheetDisplayName.split(" / ")[0]!.trim()
        delta.omitNameDedupeNormKeys!.push(estNormKey(primary))
      }
    }
    return {
      nextArtifacts: mergePhase2Artifacts(artifactAccum, delta),
      applyMutations: () => {
        for (const row of inspEstRows) {
          const ch = inspEstChoice[row.inspectionsSheetDisplayName] ?? "link"
          if (ch === "link") {
            linkInspectionsToEstablishmentName(
              drafts.inspections,
              row.inspectionNameVariantsNormKeys,
              row.suggestedEstablishment.name,
            )
          } else if (ch === "new") {
            const primary = row.inspectionsSheetDisplayName.split(" / ")[0]!.trim()
            cloneEstablishmentAsNew(row.suggestedEstablishment, primary, drafts.establishments)
          }
        }
        applyStatusHistoryToEstablishments(drafts.establishments, drafts.statusHistory)
      },
    }
  }

  function handleConfirm() {
    const p = buildPayload()
    if (p) onConfirm(p)
  }

  const showApplyAll =
    (gate === "establishmentCase" && caseRows.length > 1) ||
    (gate === "establishmentData" && dataRows.length > 1)

  return (
    <Card className={cn(
      "border-2 border-[#eab308]/40 bg-linear-to-bl from-[#fcd34d]/12 to-transparent shadow-sm dark:border-amber-600/35 dark:from-amber-950/25",
      rtl && "text-end",
    )}
    >
      <CardHeader className={cn("space-y-1 pb-2", rtl && "items-end")}>
        <CardTitle className={cn("flex flex-wrap items-start gap-2 text-xl text-foreground", rtl && "flex-row-reverse")}
        >
          <AlertTriangleIcon className="mt-0.5 size-6 shrink-0 text-amber-600" aria-hidden />
          <span>{t("dataImport.phase2PanelTitle", { current: gateIndexDisplay, total: gatesTotal })}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {showApplyAll ? (
          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card/80 p-3",
              rtl && "flex-row-reverse",
            )}
          >
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 rounded accent-amber-600"
              checked={applyAllSimilar}
              onChange={(e) => setApplyAllSimilar(e.target.checked)}
            />
            <span className="text-sm font-medium">{t("dataImport.phase2ApplyAllSimilar")}</span>
          </label>
        ) : null}

        {gate === "establishmentCase" ? (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm leading-relaxed">{t("dataImport.phase2CaseIntro")}</p>
            <ul className="space-y-4">
              {caseRows.map((c) => (
                <li
                  key={c.normKey}
                  className={cn(
                    "rounded-xl border border-border bg-card px-4 py-3 shadow-sm",
                    rtl && "[direction:rtl]",
                  )}
                >
                  <p className="wrap-break-word text-sm leading-relaxed font-medium">{c.fileDisplayName}</p>
                  <p className="wrap-break-word text-muted-foreground text-xs">{t("dataImport.phase2CaseDbSide", { name: c.dbDisplayName })}</p>
                  <div className={cn("mt-3 grid gap-2 sm:grid-cols-2", rtl && "[direction:rtl]")}>
                    <label className={cn("flex cursor-pointer gap-2 rounded-lg border border-border p-2", rtl && "flex-row-reverse")}
                    >
                      <input
                        type="radio"
                        name={`case-${c.normKey}`}
                        checked={(resolvedCaseChoice[c.normKey] ?? "canonical") === "canonical"}
                        onChange={() =>
                          setCaseChoice((prev) => ({ ...prev, [c.normKey]: "canonical" }))}
                      />
                      <span className="text-sm">{t("dataImport.phase2CaseUseDb")}</span>
                    </label>
                    <label className={cn("flex cursor-pointer gap-2 rounded-lg border border-border p-2", rtl && "flex-row-reverse")}
                    >
                      <input
                        type="radio"
                        name={`case-${c.normKey}`}
                        checked={(resolvedCaseChoice[c.normKey] ?? "canonical") === "newRow"}
                        onChange={() =>
                          setCaseChoice((prev) => ({ ...prev, [c.normKey]: "newRow" }))}
                      />
                      <span className="text-sm">{t("dataImport.phase2CaseKeepNew")}</span>
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {gate === "establishmentData" ? (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm leading-relaxed">{t("dataImport.phase2DataIntro")}</p>
            <ul className="space-y-4">
              {dataRows.map((row) => (
                <li
                  key={row.normKey}
                  className={cn(
                    "rounded-xl border border-border bg-card px-4 py-3 shadow-sm",
                    rtl && "[direction:rtl]",
                  )}
                >
                  <p className="font-medium wrap-break-word">{row.establishmentName}</p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground text-xs">
                    {row.mismatches.map((m) => (
                      <li key={`${row.normKey}-${m.fieldKey}`} className="wrap-break-word">
                        {t(`dataImport.phase2Field.${m.fieldKey}` as "dataImport.phase2Field.area")}:{" "}
                        <span className="text-foreground">{m.fileValue || "—"}</span>{" "}
                        <span className="text-muted-foreground">→</span>{" "}
                        <span className="text-foreground">{m.dbValue || "—"}</span>
                      </li>
                    ))}
                  </ul>
                  <div className={cn("mt-3 grid gap-2 sm:grid-cols-2", rtl && "[direction:rtl]")}>
                    <label className={cn("flex cursor-pointer gap-2 rounded-lg border border-border p-2", rtl && "flex-row-reverse")}
                    >
                      <input
                        type="radio"
                        name={`data-${row.normKey}`}
                        checked={(resolvedDataChoice[row.normKey] ?? "overwrite") === "overwrite"}
                        onChange={() =>
                          setDataChoice((prev) => ({ ...prev, [row.normKey]: "overwrite" }))}
                      />
                      <span className="text-sm">{t("dataImport.phase2DataWorkbookWins")}</span>
                    </label>
                    <label className={cn("flex cursor-pointer gap-2 rounded-lg border border-border p-2", rtl && "flex-row-reverse")}
                    >
                      <input
                        type="radio"
                        name={`data-${row.normKey}`}
                        checked={(resolvedDataChoice[row.normKey] ?? "overwrite") === "newRow"}
                        onChange={() =>
                          setDataChoice((prev) => ({ ...prev, [row.normKey]: "newRow" }))}
                      />
                      <span className="text-sm">{t("dataImport.phase2DataNewRow")}</span>
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {gate === "statusHistory" ? (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm leading-relaxed">{t("dataImport.phase2StatusIntro")}</p>
            <ul className="space-y-3">
              {statusRows.map((s) => {
                const k = `${s.dbEstablishmentId}|${s.calendarYear}`
                return (
                  <li
                    key={k}
                    className={cn(
                      "rounded-xl border border-border bg-card px-4 py-3 shadow-sm",
                      rtl && "[direction:rtl]",
                    )}
                  >
                    <p className="font-medium wrap-break-word">{s.establishmentName}</p>
                    <p className="text-muted-foreground text-sm">
                      {t("dataImport.phase2StatusYear", { year: s.calendarYear })}
                    </p>
                    <p className="mt-1 text-sm">
                      {t("dataImport.phase2StatusDb", { status: s.dbStatus })}{" "}
                      <span className="text-muted-foreground">→</span>{" "}
                      {t("dataImport.phase2StatusFile", { status: s.fileStatus })}
                    </p>
                    <label
                      className={cn(
                        "mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-destructive/35 bg-destructive/5 p-2",
                        rtl && "flex-row-reverse",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 accent-destructive"
                        checked={Boolean(statusRejectMap[k])}
                        onChange={(e) =>
                          setStatusRejectMap((prev) => ({ ...prev, [k]: e.target.checked }))}
                      />
                      <span className="text-destructive text-sm font-medium">
                        {t("dataImport.phase2RejectImport")}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        {gate === "inspectorFuzzy" ? (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm leading-relaxed">{t("dataImport.phase2InspectorIntro")}</p>
            <ul className="space-y-3">
              {inspFuzzy.map((f) => (
                <li
                  key={f.key}
                  className={cn(
                    "rounded-xl border border-border bg-card px-4 py-3 shadow-sm",
                    rtl && "[direction:rtl]",
                  )}
                >
                  <p className="text-sm">
                    <span className="font-medium">{f.fileLabels.join(", ")}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span className="font-medium">{f.canonicalInspectorName}</span>
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {t("dataImport.phase2Rows", {
                      rows: formatInspectionValidationRowList(f.inspectionExcelRows),
                    })}
                  </p>
                  <label
                    className={cn(
                      "mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-destructive/35 bg-destructive/5 p-2",
                      rtl && "flex-row-reverse",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-destructive"
                      checked={Boolean(inspectorRejectMap[f.key])}
                      onChange={(e) =>
                        setInspectorRejectMap((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                    />
                    <span className="text-destructive text-sm font-medium">
                      {t("dataImport.phase2RejectImport")}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {gate === "inspectionEstablishment" ? (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm leading-relaxed">{t("dataImport.phase2InspEstIntro")}</p>
            <ul className="space-y-4">
              {inspEstRows.map((row) => (
                <li
                  key={row.inspectionsSheetDisplayName}
                  className={cn(
                    "rounded-xl border border-border bg-card px-4 py-3 shadow-sm",
                    rtl && "[direction:rtl]",
                  )}
                >
                  <p className="font-medium wrap-break-word">{row.inspectionsSheetDisplayName}</p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {t("dataImport.phase2Suggested", { name: row.suggestedEstablishment.name })}
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {t("dataImport.phase2Rows", {
                      rows: formatInspectionValidationRowList(row.inspectionExcelRows),
                    })}
                  </p>
                  <div className={cn("mt-3 grid gap-2 sm:grid-cols-3", rtl && "[direction:rtl]")}>
                    {(
                      [
                        ["link", t("dataImport.phase2InspEstLink")] as const,
                        ["new", t("dataImport.phase2InspEstNew")] as const,
                        ["reject", t("dataImport.phase2InspEstReject")] as const,
                      ]
                    ).map(([val, label]) => (
                      <label
                        key={val}
                        className={cn(
                          "flex cursor-pointer gap-2 rounded-lg border border-border p-2",
                          rtl && "flex-row-reverse",
                        )}
                      >
                        <input
                          type="radio"
                          name={`insp-est-${row.inspectionsSheetDisplayName}`}
                          checked={
                            (inspEstChoice[row.inspectionsSheetDisplayName] ?? "link") === val
                          }
                          onChange={() =>
                            setInspEstChoice((prev) => ({
                              ...prev,
                              [row.inspectionsSheetDisplayName]: val,
                            }))}
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className={cn("flex flex-wrap gap-3 pt-2", rtl ? "flex-row-reverse justify-between" : "justify-end")}
        >
          <Button type="button" variant="outline" onClick={onRejectWholeImport}>
            {t("dataImport.phase2CancelImport")}
          </Button>
          <Button type="button" variant="gold" className="gap-2 font-semibold" onClick={handleConfirm}>
            {t("dataImport.phase2ConfirmGate")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
