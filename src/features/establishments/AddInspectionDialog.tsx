import { CalendarIcon, ChevronsUpDown, Loader2Icon, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import toast from "react-hot-toast"

import { useAuth } from "@/auth/AuthContext"
import { formatInspectionDateDdMmYyyy } from "@/data/establishmentsTable"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { useInspectors } from "@/hooks/useInspectors"
import { useRatings } from "@/hooks/useRatings"
import { useYears } from "@/hooks/useYears"
import type { EnrichedEstablishmentRow } from "@/lib/dataTableModel"
import { isLocalDateAfterToday, toIsoDateLocal } from "@/lib/dateIsoLocal"
import { canEditInspection } from "@/lib/permissions/canMutateInspection"
import type { EstablishmentInspectionDetail } from "@/lib/supabase/remoteDataset"
import { insertManualInspection } from "@/lib/supabase/insertManualInspection"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

export type AddInspectionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: EnrichedEstablishmentRow | null
  /** When set, dialog updates this inspection instead of inserting. */
  editingInspection?: EstablishmentInspectionDetail | null
  /** When `establishment.areaId` is missing, pass UUID from area name match (detail sheet). */
  establishmentAreaIdResolved?: string | null
  onSuccess?: () => void
}

type FormValues = {
  inspectionDate: Date
  ratingId: string
  inspectorId: string
  referenceNumber: string
  notes: string
  taskType: string
}

export function AddInspectionDialog({
  open,
  onOpenChange,
  row,
  editingInspection = null,
  establishmentAreaIdResolved = null,
  onSuccess,
}: AddInspectionDialogProps) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const isRtl = i18n.language.startsWith("ar")
  const isEditing = Boolean(editingInspection)

  const { data: ratings, loading: ratingsLoading } = useRatings()
  const { data: inspectorsRaw, loading: inspectorsLoading } = useInspectors()
  const { data: yearsRows, loading: yearsLoading } = useYears()

  const [dateOpen, setDateOpen] = useState(false)
  const [ratingOpen, setRatingOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [inspectorQuery, setInspectorQuery] = useState("")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const inspectors = useMemo(
    () => inspectorsRaw.filter((i) => i.isActive),
    [inspectorsRaw],
  )

  const sortedInspectors = useMemo(() => {
    const copy = [...inspectors]
    copy.sort((a, b) => {
      const la = (isRtl ? a.nameAr || a.nameEn : a.nameEn || a.nameAr).trim()
      const lb = (isRtl ? b.nameAr || b.nameEn : b.nameEn || b.nameAr).trim()
      return la.localeCompare(lb, isRtl ? "ar" : "en", { sensitivity: "base" })
    })
    return copy
  }, [inspectors, isRtl])

  const filteredInspectors = useMemo(() => {
    const q = inspectorQuery.trim().toLowerCase()
    if (!q) return sortedInspectors
    return sortedInspectors.filter((x) => {
      const ar = x.nameAr.toLowerCase()
      const en = x.nameEn.toLowerCase()
      return ar.includes(q) || en.includes(q)
    })
  }, [sortedInspectors, inspectorQuery])

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      inspectionDate: new Date(),
      ratingId: "",
      inspectorId: "",
      referenceNumber: "",
      notes: "",
      taskType: "",
    },
  })

  useEffect(() => {
    if (!open || !row) return
    if (editingInspection) {
      reset({
        inspectionDate: editingInspection.inspectionDate ?? new Date(),
        ratingId: editingInspection.ratingId,
        inspectorId: editingInspection.inspectorId,
        referenceNumber: editingInspection.refNumber ?? "",
        notes: editingInspection.note ?? "",
        taskType: editingInspection.taskType ?? "",
      })
    } else {
      reset({
        inspectionDate: new Date(),
        ratingId: "",
        inspectorId: "",
        referenceNumber: "",
        notes: "",
        taskType: "",
      })
    }
    setSaveError(null)
    setInspectorQuery("")
    setDateOpen(false)
    setRatingOpen(false)
    setInspectorOpen(false)
  }, [open, row?.establishment.id, editingInspection?.id, reset, editingInspection, row])

  const ratingLabel = (id: string) => {
    const r = ratings.find((x) => x.id === id)
    if (!r) return ""
    const ar = r.nameAr.trim()
    const en = r.nameEn.trim()
    if (isRtl) return ar || en
    return en || ar
  }

  const inspectorLabel = (id: string) => {
    const i = inspectors.find((x) => x.id === id)
    if (!i) return ""
    if (isRtl) return (i.nameAr || i.nameEn).trim()
    return (i.nameEn || i.nameAr).trim()
  }

  const lookupsLoading = ratingsLoading || inspectorsLoading || yearsLoading

  const onSubmit = handleSubmit(async (values) => {
    if (!row) return
    setSaveError(null)
    setSubmitting(true)
    try {
      if (isEditing && editingInspection) {
        if (
          !canEditInspection(
            editingInspection,
            row.establishment,
            { role: user.role, areas: user.areas },
            establishmentAreaIdResolved,
          )
        ) {
          toast.error(t("addInspection.noPermissionEdit"))
          return
        }
        const calYear = values.inspectionDate.getFullYear()
        const yearRow = yearsRows.find((y) => y.year === calYear)
        if (!yearRow) {
          setSaveError(t("addInspection.yearMissing", { year: String(calYear) }))
          toast.error(t("addInspection.errorEdit"))
          return
        }
        const { error } = await supabase
          .from("inspections")
          .update({
            inspection_date: toIsoDateLocal(values.inspectionDate),
            rating_id: values.ratingId,
            inspector_id: values.inspectorId,
            reference_number: values.referenceNumber.trim() || null,
            notes: values.notes.trim() || null,
            task_type: values.taskType.trim() || null,
            year_id: yearRow.id,
          })
          .eq("id", editingInspection.id)

        if (error) {
          setSaveError(error.message)
          toast.error(t("addInspection.errorEdit"))
          return
        }

        toast.success(t("addInspection.successEdit"))
        onOpenChange(false)
        onSuccess?.()
        return
      }

      const res = await insertManualInspection(supabase, {
        establishmentId: row.establishment.id,
        inspectionDate: values.inspectionDate,
        ratingId: values.ratingId,
        inspectorId: values.inspectorId,
        referenceNumber: values.referenceNumber.trim() || null,
        notes: values.notes.trim() || null,
        taskType: values.taskType.trim() || null,
        years: yearsRows.map((y) => ({ id: y.id, year: y.year })),
      })

      if (!res.ok) {
        setSaveError(res.message)
        toast.error(t("addInspection.error"))
        return
      }

      toast.success(t("addInspection.success"))
      onOpenChange(false)
      onSuccess?.()
    } finally {
      setSubmitting(false)
    }
  })

  if (!row) return null

  const title = isEditing ? t("addInspection.editTitle") : t("addInspection.title")
  const saveLabel = isEditing ? t("addInspection.saveChanges") : t("addInspection.save")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-[#8B1538]">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            {title} — {row.establishment.name}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="add-insp-est-name">{t("addInspection.establishmentName")} *</Label>
            <Input
              id="add-insp-est-name"
              value={row.establishment.name}
              readOnly
              disabled
              className="bg-muted font-medium"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("addInspection.inspectionDate")} *</Label>
            <Controller
              control={control}
              name="inspectionDate"
              rules={{
                validate: {
                  required: (v) =>
                    (v instanceof Date && !Number.isNaN(v.getTime())) ||
                    t("addInspection.dateRequired"),
                  notFuture: (v) =>
                    !(v instanceof Date && isLocalDateAfterToday(v)) ||
                    t("addInspection.dateFuture"),
                },
              }}
              render={({ field }) => (
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "h-10 w-full justify-between font-normal",
                        !field.value && "text-muted-foreground",
                      )}
                      disabled={lookupsLoading}
                    >
                      {field.value
                        ? formatInspectionDateDdMmYyyy(field.value)
                        : t("addInspection.inspectionDate")}
                      <CalendarIcon className="size-4 opacity-70" aria-hidden />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start" dir={isRtl ? "rtl" : "ltr"}>
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(d) => {
                        field.onChange(d ?? field.value)
                        setDateOpen(false)
                      }}
                      disabled={(d) => isLocalDateAfterToday(d)}
                      defaultMonth={field.value}
                    />
                  </PopoverContent>
                </Popover>
              )}
            />
            {errors.inspectionDate ? (
              <p className="text-sm text-destructive">{errors.inspectionDate.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>{t("addInspection.rating")} *</Label>
            <Controller
              control={control}
              name="ratingId"
              rules={{
                validate: (v) => (v?.trim() ? true : t("addInspection.ratingRequired")),
              }}
              render={({ field }) => (
                <Popover open={ratingOpen} onOpenChange={setRatingOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto min-h-10 w-full justify-between py-2 font-normal"
                      disabled={lookupsLoading || ratings.length === 0}
                    >
                      <span className="flex min-w-0 items-center gap-2 text-start">
                        {field.value ? (
                          <>
                            <span
                              className="size-3 shrink-0 rounded-full ring-1 ring-border"
                              style={{
                                backgroundColor:
                                  ratings.find((r) => r.id === field.value)?.color ?? "#64748b",
                              }}
                              aria-hidden
                            />
                            <span className="truncate">{ratingLabel(field.value)}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            {t("addInspection.ratingPlaceholder")}
                          </span>
                        )}
                      </span>
                      <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="max-h-72 w-[var(--radix-popover-trigger-width)] p-1"
                    align="start"
                  >
                    <div className="max-h-64 overflow-y-auto">
                      {ratings.map((r) => {
                        const label = isRtl
                          ? r.nameAr.trim() || r.nameEn
                          : r.nameEn.trim() || r.nameAr
                        return (
                          <button
                            key={r.id}
                            type="button"
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2 py-2 text-start text-sm hover:bg-muted",
                              field.value === r.id && "bg-muted font-medium",
                            )}
                            onClick={() => {
                              field.onChange(r.id)
                              setRatingOpen(false)
                            }}
                          >
                            <span
                              className="size-3 shrink-0 rounded-full ring-1 ring-border"
                              style={{ backgroundColor: r.color }}
                              aria-hidden
                            />
                            <span className="min-w-0">{label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            />
            {errors.ratingId ? (
              <p className="text-sm text-destructive">{errors.ratingId.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>{t("addInspection.inspector")} *</Label>
            <Controller
              control={control}
              name="inspectorId"
              rules={{
                validate: (v) => (v?.trim() ? true : t("addInspection.inspectorRequired")),
              }}
              render={({ field }) => (
                <Popover
                  open={inspectorOpen}
                  onOpenChange={(o) => {
                    setInspectorOpen(o)
                    if (!o) setInspectorQuery("")
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto min-h-10 w-full justify-between py-2 font-normal"
                      disabled={lookupsLoading || inspectors.length === 0}
                    >
                      <span className="min-w-0 truncate text-start">
                        {field.value ? (
                          inspectorLabel(field.value)
                        ) : (
                          <span className="text-muted-foreground">
                            {t("addInspection.inspectorPlaceholder")}
                          </span>
                        )}
                      </span>
                      <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] p-2"
                    align="start"
                  >
                    <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                      <Search className="size-4 shrink-0 opacity-60" aria-hidden />
                      <Input
                        value={inspectorQuery}
                        onChange={(e) => setInspectorQuery(e.target.value)}
                        placeholder={t("addInspection.inspectorSearch")}
                        className="h-8 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                        aria-label={t("addInspection.inspectorSearch")}
                      />
                    </div>
                    <div className="mt-2 max-h-52 overflow-y-auto">
                      {filteredInspectors.length === 0 ? (
                        <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                          {t("addInspection.inspectorEmpty")}
                        </p>
                      ) : (
                        filteredInspectors.map((i) => {
                          const label = (
                            isRtl ? i.nameAr || i.nameEn : i.nameEn || i.nameAr
                          ).trim()
                          return (
                            <button
                              key={i.id}
                              type="button"
                              className={cn(
                                "w-full rounded-md px-2 py-2 text-start text-sm hover:bg-muted",
                                field.value === i.id && "bg-muted font-medium",
                              )}
                              onClick={() => {
                                field.onChange(i.id)
                                setInspectorOpen(false)
                                setInspectorQuery("")
                              }}
                            >
                              {label}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            />
            {errors.inspectorId ? (
              <p className="text-sm text-destructive">{errors.inspectorId.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-insp-ref">{t("addInspection.referenceNumber")}</Label>
            <Input
              id="add-insp-ref"
              maxLength={50}
              placeholder={t("addInspection.referencePlaceholder")}
              disabled={lookupsLoading}
              {...register("referenceNumber", { maxLength: 50 })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-insp-task">{t("addInspection.taskType")}</Label>
            <Input
              id="add-insp-task"
              maxLength={120}
              placeholder={t("addInspection.taskTypePlaceholder")}
              disabled={lookupsLoading}
              {...register("taskType", { maxLength: 120 })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-insp-notes">{t("addInspection.notes")}</Label>
            <Textarea
              id="add-insp-notes"
              rows={3}
              maxLength={500}
              placeholder={t("addInspection.notesPlaceholder")}
              disabled={lookupsLoading}
              {...register("notes", { maxLength: 500 })}
            />
            <p className="text-xs text-muted-foreground">
              {watch("notes")?.length ?? 0} / 500
            </p>
          </div>

          {saveError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {saveError}
            </p>
          ) : null}

          <DialogFooter className={cn(isRtl && "sm:flex-row-reverse")}>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
              className="border-[#8B1538]/35"
            >
              {t("addInspection.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={submitting || lookupsLoading}
              className="inline-flex items-center justify-center gap-2 bg-[#8B1538] text-white hover:bg-[#8B1538]/90"
            >
              {submitting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                  {t("addInspection.saving")}
                </>
              ) : (
                saveLabel
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
