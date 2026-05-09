import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useForm, type Resolver } from "react-hook-form"
import { useTranslation } from "react-i18next"
import toast from "react-hot-toast"
import { z } from "zod"

import { useAuth } from "@/auth/AuthContext"
import { Button } from "@/components/ui/button"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { EnrichedEstablishmentRow } from "@/lib/dataTableModel"
import { canEditEstablishment } from "@/lib/permissions/canEditEstablishment"
import { fetchYearIdForCalendarYear } from "@/lib/supabase/remoteDataset"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

export type AddEstablishmentDialogProps = {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  mode?: "add" | "edit"
  /** When `mode` is `"edit"`, list row used for initial values and establishment id. */
  editRow?: EnrichedEstablishmentRow | null
}

type AreaOption = { id: string; nameAr: string; nameEn: string }
type StatusOption = { id: string; nameAr: string; nameEn: string }

type FormValues = {
  name: string
  area_id: string
  location: string
  activity_type: string
  name_in_ems: string
  cr_number: string
  account_status: string
  operational_status_id: string
  phone: string
  person_in_charge: string
  email: string
  service_hours: string
  notes: string
  photo_url: string
  nb_outlets: string
}

type EditMeta = {
  establishmentId: string
  originalAreaId: string
}

function emptyToNull(s: string | undefined): string | null {
  const t = String(s ?? "").trim()
  return t === "" ? null : t
}

function normalizePhoneForCheck(s: string): string {
  return s.replace(/[\s().-]/g, "")
}

function rowToFormValues(
  row: EnrichedEstablishmentRow,
  areas: AreaOption[],
): FormValues {
  const e = row.establishment
  let areaId = e.areaId ?? ""
  if (!areaId && areas.length > 0) {
    const ar = String(e.area ?? "").trim()
    const en = String(row.areaNameEn ?? e.areaNameEn ?? "").trim()
    const hit = areas.find(
      (a) =>
        a.nameAr.trim() === ar ||
        a.nameEn.trim() === ar ||
        (en !== "" && (a.nameEn.trim() === en || a.nameAr.trim() === en)),
    )
    areaId = hit?.id ?? ""
  }
  const nb =
    e.nbOutlets != null && Number.isFinite(Number(e.nbOutlets))
      ? String(e.nbOutlets)
      : ""
  return {
    name: e.name ?? "",
    area_id: areaId,
    location: e.location ?? "",
    activity_type: e.activityType ?? "",
    name_in_ems: e.nameInEms ?? "",
    cr_number: e.crNumber ?? "",
    account_status: e.accountStatusInEms ?? "",
    operational_status_id: e.operationalStatusId ?? "",
    phone: e.phone ?? "",
    person_in_charge: e.personInCharge ?? "",
    email: e.email ?? "",
    service_hours: e.serviceHours ?? "",
    notes: e.establishmentNote ?? "",
    photo_url: e.establishmentPhoto ?? "",
    nb_outlets: nb,
  }
}

async function syncStatusHistoryForCurrentYear(
  establishmentId: string,
  operationalStatusId: string,
): Promise<void> {
  const year = new Date().getFullYear()
  const yearId = await fetchYearIdForCalendarYear(supabase, year)
  if (!yearId) return

  const { data: histHit } = await supabase
    .from("establishment_status_history")
    .select("id")
    .eq("establishment_id", establishmentId)
    .eq("year_id", yearId)
    .maybeSingle()

  if (histHit) {
    const { error } = await supabase
      .from("establishment_status_history")
      .update({ operational_status_id: operationalStatusId })
      .eq("establishment_id", establishmentId)
      .eq("year_id", yearId)
    if (error) console.warn("establishment_status_history update:", error.message)
  } else {
    const { error } = await supabase.from("establishment_status_history").insert({
      establishment_id: establishmentId,
      year_id: yearId,
      operational_status_id: operationalStatusId,
    })
    if (error) console.warn("establishment_status_history insert:", error.message)
  }
}

export function AddEstablishmentDialog({
  open,
  onClose,
  onSuccess,
  mode = "add",
  editRow = null,
}: AddEstablishmentDialogProps) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const isRtl = i18n.language.startsWith("ar")
  const isEdit = mode === "edit" && editRow != null
  const editMetaRef = useRef<EditMeta | null>(null)

  const [areas, setAreas] = useState<AreaOption[]>([])
  const [statuses, setStatuses] = useState<StatusOption[]>([])
  const [lookupsLoading, setLookupsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const formSchema = useMemo(() => {
    const emailOrEmpty = z.union([
      z.literal(""),
      z.string().email(t("establishmentsPage.addDialog.errors.email")),
    ])
    const urlOrEmpty = z.union([
      z.literal(""),
      z.string().url(t("establishmentsPage.addDialog.errors.photoUrl")),
    ])
    return z.object({
      name: z.string().min(1, t("establishmentsPage.addDialog.errors.name")),
      area_id: z.string().min(1, t("establishmentsPage.addDialog.errors.area")),
      location: z.string().min(1, t("establishmentsPage.addDialog.errors.location")),
      activity_type: z
        .string()
        .min(1, t("establishmentsPage.addDialog.errors.activity")),
      name_in_ems: z.string().optional(),
      cr_number: z.string().optional(),
      account_status: z.string().optional(),
      operational_status_id: z.string().optional(),
      phone: z
        .string()
        .optional()
        .refine((v) => {
          const raw = (v ?? "").trim()
          if (!raw) return true
          const norm = normalizePhoneForCheck(raw)
          return /^\+?[0-9]{7,15}$/.test(norm)
        }, t("establishmentsPage.addDialog.errors.phone")),
      person_in_charge: z.string().optional(),
      email: emailOrEmpty,
      service_hours: z.string().optional(),
      notes: z.string().optional(),
      photo_url: urlOrEmpty,
      nb_outlets: z
        .string()
        .optional()
        .refine((s) => {
          const v = (s ?? "").trim()
          if (!v) return true
          const n = Number.parseInt(v, 10)
          return Number.isFinite(n) && n >= 0
        }, t("establishmentsPage.addDialog.errors.nbOutlets")),
    })
  }, [t])

  const defaultValues = useMemo(
    () =>
      ({
        name: "",
        area_id: "",
        location: "",
        activity_type: "",
        name_in_ems: "",
        cr_number: "",
        account_status: "",
        operational_status_id: "",
        phone: "",
        person_in_charge: "",
        email: "",
        service_hours: "",
        notes: "",
        photo_url: "",
        nb_outlets: "",
      }) satisfies FormValues,
    [],
  )

  const {
    register,
    handleSubmit,
    reset,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues,
  })

  const loadLookups = useCallback(async () => {
    setLookupsLoading(true)
    try {
      const restrictAreas = user.role !== "admin"
      const allowed = restrictAreas ? new Set(user.areas) : null

      const areaRes = await supabase
        .from("areas")
        .select("id, name_ar, name_en, is_active")
        .order("name_ar", { ascending: true })
      let areaRows = areaRes.data as Record<string, unknown>[] | null
      if (areaRes.error && /is_active/i.test(areaRes.error.message)) {
        const fallback = await supabase
          .from("areas")
          .select("id, name_ar, name_en")
          .order("name_ar", { ascending: true })
        if (fallback.error) throw new Error(fallback.error.message)
        areaRows = fallback.data as Record<string, unknown>[]
      } else if (areaRes.error) {
        throw new Error(areaRes.error.message)
      }

      const areaOpts: AreaOption[] = (areaRows ?? [])
        .map((r) => ({
          id: String(r.id ?? ""),
          nameAr: String(r.name_ar ?? ""),
          nameEn: String(r.name_en ?? ""),
          is_active: r.is_active,
        }))
        .filter((r) => r.id)
        .filter((r) => r.is_active !== false)
        .filter((r) => !allowed || allowed.has(r.id))

      setAreas(areaOpts.map(({ id, nameAr, nameEn }) => ({ id, nameAr, nameEn })))

      let stRows: Record<string, unknown>[] | null = null
      const stPrimary = await supabase
        .from("operational_statuses")
        .select("id, name_ar, name_en, is_active")
        .order("name_en", { ascending: true })

      if (stPrimary.error && /is_active/i.test(stPrimary.error.message)) {
        const stFallback = await supabase
          .from("operational_statuses")
          .select("id, name_ar, name_en")
          .order("name_en", { ascending: true })
        if (stFallback.error) throw new Error(stFallback.error.message)
        stRows = (stFallback.data ?? []) as Record<string, unknown>[]
      } else if (stPrimary.error) {
        throw new Error(stPrimary.error.message)
      } else {
        stRows = (stPrimary.data ?? []) as Record<string, unknown>[]
      }

      setStatuses(
        (stRows ?? [])
          .filter((r) => r.is_active !== false)
          .map((r) => ({
            id: String(r.id ?? ""),
            nameAr: String(r.name_ar ?? ""),
            nameEn: String(r.name_en ?? ""),
          }))
          .filter((s) => s.id),
      )
    } catch (e) {
      console.error(e)
      toast.error(t("establishmentsPage.addDialog.loadLookupsFailed"))
      setAreas([])
      setStatuses([])
    } finally {
      setLookupsLoading(false)
    }
  }, [t, user.role, user.areas])

  useEffect(() => {
    if (!open) return
    void loadLookups()
  }, [open, loadLookups])

  useEffect(() => {
    if (!open || lookupsLoading) return
    if (isEdit && editRow) {
      const values = rowToFormValues(editRow, areas)
      reset(values)
      editMetaRef.current = {
        establishmentId: editRow.establishment.id,
        originalAreaId: values.area_id,
      }
    } else if (!isEdit) {
      editMetaRef.current = null
      reset(defaultValues)
    }
  }, [
    open,
    lookupsLoading,
    isEdit,
    editRow?.establishment.id,
    areas,
    reset,
    defaultValues,
    editRow,
  ])

  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      document.getElementById("add-est-name")?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  const resolveDefaultOpenStatusId = useCallback((list: StatusOption[]) => {
    const hit = list.find((s) => s.nameEn.trim().toLowerCase() === "open")
    return hit?.id ?? ""
  }, [])

  useEffect(() => {
    if (!open || lookupsLoading || statuses.length === 0) return
    if (isEdit) return
    const cur = getValues("operational_status_id")
    if (cur) return
    const def = resolveDefaultOpenStatusId(statuses)
    if (def) setValue("operational_status_id", def, { shouldValidate: false })
  }, [
    open,
    lookupsLoading,
    statuses,
    getValues,
    setValue,
    resolveDefaultOpenStatusId,
    isEdit,
  ])

  const nameW = watch("name")
  const areaW = watch("area_id")
  const locW = watch("location")
  const actW = watch("activity_type")
  const requiredOk = Boolean(
    String(nameW ?? "").trim() &&
      String(areaW ?? "").trim() &&
      String(locW ?? "").trim() &&
      String(actW ?? "").trim(),
  )

  const areaLabel = (a: AreaOption) => {
    const ar = a.nameAr.trim()
    const en = a.nameEn.trim()
    if (isRtl) return ar || en
    return en || ar
  }

  const statusLabel = (s: StatusOption) => {
    const ar = s.nameAr.trim()
    const en = s.nameEn.trim()
    if (isRtl) return ar || en
    return en || ar
  }

  const dialogTitle = isEdit
    ? t("establishmentsPage.editDialog.title")
    : t("establishmentsPage.addDialog.title")

  const submitLabel = isEdit
    ? t("establishmentsPage.editDialog.save")
    : t("dataImport.save")

  const onSubmit = handleSubmit(async (data) => {
    const list =
      statuses.length > 0
        ? statuses
        : await (async () => {
            const stRes = await supabase
              .from("operational_statuses")
              .select("id, name_ar, name_en, is_active")
              .order("name_en", { ascending: true })
            if (stRes.error) return []
            return (stRes.data ?? [])
              .filter((r: Record<string, unknown>) => r.is_active !== false)
              .map((r: Record<string, unknown>) => ({
                id: String(r.id ?? ""),
                nameAr: String(r.name_ar ?? ""),
                nameEn: String(r.name_en ?? ""),
              }))
              .filter((s: StatusOption) => s.id)
          })()

    let operationalId = emptyToNull(data.operational_status_id) ?? null
    if (!operationalId) {
      const def = list.find((s) => s.nameEn.trim().toLowerCase() === "open")
      operationalId = def?.id ?? list[0]?.id ?? null
    }
    if (!operationalId) {
      toast.error(t("establishmentsPage.addDialog.noOperationalStatus"))
      return
    }

    const nbTrim = (data.nb_outlets ?? "").trim()
    const nbParsed = nbTrim === "" ? null : Number.parseInt(nbTrim, 10)
    const nbOutlets =
      nbParsed != null && Number.isFinite(nbParsed) ? nbParsed : null

    const commonPayload = {
      name: data.name.trim(),
      area_id: data.area_id,
      location: data.location.trim(),
      activity_type: data.activity_type.trim(),
      name_in_ems: emptyToNull(data.name_in_ems),
      cr_number: emptyToNull(data.cr_number),
      account_status_in_ems: emptyToNull(data.account_status),
      operational_status_id: operationalId,
      phone: emptyToNull(data.phone),
      person_in_charge: emptyToNull(data.person_in_charge),
      email: emptyToNull(data.email),
      service_hours: emptyToNull(data.service_hours),
      notes: emptyToNull(data.notes),
      photo_url: emptyToNull(data.photo_url),
      nb_outlets: nbOutlets,
    }

    setSubmitting(true)
    try {
      if (isEdit && editMetaRef.current) {
        const meta = editMetaRef.current
        if (
          !canEditEstablishment(
            { area_id: meta.originalAreaId },
            { role: user.role, areas: user.areas },
          )
        ) {
          toast.error(t("establishmentsPage.editDialog.noPermission"))
          return
        }
        if (user.role !== "admin") {
          const ids = user.areas ?? []
          if (!ids.includes(data.area_id)) {
            toast.error(t("establishmentsPage.editDialog.noPermission"))
            return
          }
        }

        const updatePayload = {
          ...commonPayload,
          updated_at: new Date().toISOString(),
        }

        const { error } = await supabase
          .from("establishments")
          .update(updatePayload)
          .eq("id", meta.establishmentId)

        if (error) throw error

        await syncStatusHistoryForCurrentYear(meta.establishmentId, operationalId)

        toast.success(t("establishmentsPage.editDialog.success"))
      } else {
        const insertPayload = {
          ...commonPayload,
          task_type: null as string | null,
        }

        const { data: inserted, error } = await supabase
          .from("establishments")
          .insert(insertPayload)
          .select("id")
          .maybeSingle()

        if (error) throw error

        const newId = (inserted as { id?: string } | null)?.id
        if (newId) {
          const year = new Date().getFullYear()
          const yearId = await fetchYearIdForCalendarYear(supabase, year)
          if (yearId) {
            const { data: histHit } = await supabase
              .from("establishment_status_history")
              .select("id")
              .eq("establishment_id", String(newId))
              .eq("year_id", yearId)
              .maybeSingle()
            if (!histHit) {
              const { error: hErr } = await supabase
                .from("establishment_status_history")
                .insert({
                  establishment_id: String(newId),
                  year_id: yearId,
                  operational_status_id: operationalId,
                })
              if (hErr) console.warn("establishment_status_history:", hErr.message)
            }
          }
        }

        toast.success(t("establishmentsPage.addDialog.success"))
      }

      onClose()
      onSuccess?.()
    } catch (err) {
      console.error(err)
      toast.error(
        isEdit
          ? t("establishmentsPage.editDialog.error")
          : t("establishmentsPage.addDialog.error"),
      )
    } finally {
      setSubmitting(false)
    }
  })

  const fieldHint = (msg?: string) =>
    msg ? (
      <p className="text-destructive mt-1 text-xs font-medium" role="alert">
        {msg}
      </p>
    ) : null

  const tabsKey = `${mode}-${isEdit ? editRow?.establishment.id ?? "" : "add"}`

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        className={cn(
          "flex max-h-[min(90vh,calc(100dvh-2rem))] w-[calc(100vw-1rem)] max-w-[800px] flex-col p-0 sm:max-w-[800px]",
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
        dir={isRtl ? "rtl" : "ltr"}
      >
        <div className="flex max-h-[inherit] flex-col overflow-hidden px-6 pt-6 pb-2">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-[#8B1538] dark:text-[#c94d6d]">
              {dialogTitle}
            </DialogTitle>
            <DialogDescription className="sr-only">{dialogTitle}</DialogDescription>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={onSubmit}
            noValidate
          >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pe-1">
              <Tabs key={tabsKey} defaultValue="basic" className="pb-4">
                <TabsList
                  className={cn("mb-4 flex w-full flex-nowrap gap-2", isRtl && "flex-row-reverse")}
                >
                  <TabsTrigger value="basic">
                    {t("establishmentsPage.addDialog.tabs.basic")}
                  </TabsTrigger>
                  <TabsTrigger value="registration">
                    {t("establishmentsPage.addDialog.tabs.registration")}
                  </TabsTrigger>
                  <TabsTrigger value="operational">
                    {t("establishmentsPage.addDialog.tabs.operational")}
                  </TabsTrigger>
                  <TabsTrigger value="contact">
                    {t("establishmentsPage.addDialog.tabs.contact")}
                  </TabsTrigger>
                  <TabsTrigger value="additional">
                    {t("establishmentsPage.addDialog.tabs.additional")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="mt-0 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="add-est-name">
                      {t("establishmentsPage.detail.name")} *
                    </Label>
                    <Input
                      id="add-est-name"
                      {...register("name")}
                      autoComplete="organization"
                      disabled={lookupsLoading}
                      aria-invalid={errors.name ? true : undefined}
                    />
                    {fieldHint(errors.name?.message)}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-est-area">
                      {t("establishmentsPage.detail.mainArea")} *
                    </Label>
                    <select
                      id="add-est-area"
                      className={cn(
                        "h-10 min-h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                      disabled={lookupsLoading}
                      aria-invalid={errors.area_id ? true : undefined}
                      {...register("area_id")}
                    >
                      <option value="">
                        {t("establishmentsPage.addDialog.selectArea")}
                      </option>
                      {areas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {areaLabel(a)}
                        </option>
                      ))}
                    </select>
                    {fieldHint(errors.area_id?.message)}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-est-location">
                      {t("establishmentsPage.detail.location")} *
                    </Label>
                    <Input
                      id="add-est-location"
                      {...register("location")}
                      disabled={lookupsLoading}
                      aria-invalid={errors.location ? true : undefined}
                    />
                    {fieldHint(errors.location?.message)}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-est-activity">
                      {t("establishmentsPage.detail.activityType")} *
                    </Label>
                    <Input
                      id="add-est-activity"
                      {...register("activity_type")}
                      disabled={lookupsLoading}
                      aria-invalid={errors.activity_type ? true : undefined}
                    />
                    {fieldHint(errors.activity_type?.message)}
                  </div>
                </TabsContent>

                <TabsContent value="registration" className="mt-0 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="add-est-name-ems">
                      {t("establishmentsPage.detail.nameEms")}
                    </Label>
                    <Input id="add-est-name-ems" {...register("name_in_ems")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-est-cr">{t("establishmentsPage.detail.crNumber")}</Label>
                    <Input id="add-est-cr" {...register("cr_number")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-est-acct">
                      {t("establishmentsPage.detail.accountEms")}
                    </Label>
                    <Input id="add-est-acct" {...register("account_status")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-est-outlets">
                      {t("establishmentsPage.detail.nbOutlets")}
                    </Label>
                    <Input
                      id="add-est-outlets"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      {...register("nb_outlets")}
                      aria-invalid={errors.nb_outlets ? true : undefined}
                    />
                    {fieldHint(errors.nb_outlets?.message as string | undefined)}
                  </div>
                </TabsContent>

                <TabsContent value="operational" className="mt-0 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="add-est-op-status">
                      {t("establishmentsPage.detail.operationalStatus")}
                    </Label>
                    <select
                      id="add-est-op-status"
                      className={cn(
                        "h-10 min-h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                      {...register("operational_status_id")}
                    >
                      <option value="">
                        {t("establishmentsPage.addDialog.selectStatus")}
                      </option>
                      {statuses.map((s) => (
                        <option key={s.id} value={s.id}>
                          {statusLabel(s)}
                        </option>
                      ))}
                    </select>
                  </div>
                </TabsContent>

                <TabsContent value="contact" className="mt-0 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="add-est-phone">{t("establishmentsPage.detail.phone")}</Label>
                    <Input
                      id="add-est-phone"
                      type="tel"
                      inputMode="tel"
                      {...register("phone")}
                      aria-invalid={errors.phone ? true : undefined}
                    />
                    {fieldHint(errors.phone?.message)}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-est-pic">
                      {t("establishmentsPage.detail.personInCharge")}
                    </Label>
                    <Input id="add-est-pic" {...register("person_in_charge")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-est-email">{t("establishmentsPage.detail.email")}</Label>
                    <Input
                      id="add-est-email"
                      type="email"
                      autoComplete="email"
                      {...register("email")}
                      aria-invalid={errors.email ? true : undefined}
                    />
                    {fieldHint(errors.email?.message)}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-est-hours">
                      {t("establishmentsPage.detail.serviceHours")}
                    </Label>
                    <Input id="add-est-hours" {...register("service_hours")} />
                  </div>
                </TabsContent>

                <TabsContent value="additional" className="mt-0 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="add-est-notes">{t("establishmentsPage.detail.notes")}</Label>
                    <Textarea id="add-est-notes" rows={4} {...register("notes")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-est-photo">{t("establishmentsPage.detail.photo")}</Label>
                    <Input
                      id="add-est-photo"
                      placeholder="https://"
                      {...register("photo_url")}
                      aria-invalid={errors.photo_url ? true : undefined}
                    />
                    {fieldHint(errors.photo_url?.message)}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <DialogFooter
              className={cn(
                "shrink-0 border-t border-border bg-card pt-4 pb-6",
                isRtl && "sm:flex-row-reverse",
              )}
            >
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={submitting}
              >
                {t("dataImport.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={submitting || lookupsLoading || !requiredOk}
                className="bg-[#8B1538] text-white hover:bg-[#8B1538]/90"
              >
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
